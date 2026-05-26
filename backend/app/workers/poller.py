"""Background poller: pulls chains on a schedule and runs the full analytics pipeline.

For free/delayed providers, this is the only way to keep state fresh. When a
real-time tape provider is wired in, it can push directly to the same StateStore
in addition to the periodic chain refresh.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime

from app.adapters import DataAdapter
from app.ai.commentary import build_commentary
from app.analytics.bias_engine import compute_bias
from app.analytics.exposure import build_gex_profile, enrich_chain
from app.analytics.flow import (
    compute_flow_metrics,
    detect_flow_events,
    rank_unusual_strikes,
    summarize_flow_sentiment,
)
from app.analytics.levels import key_levels_from_gex
from app.analytics.regime import classify
from app.analytics.vol import build_iv_summary, realized_vol
from app.config import Settings
from app.logging_config import get_logger
from app.schemas import ChainSnapshot, TerminalSnapshot
from app.state import StateStore

log = get_logger("poller")


def _gex_for_expiry(chain: ChainSnapshot, expiry: date) -> "GEXProfile | None":
    """Build a GEX profile restricted to a single expiration date."""
    from app.schemas import GEXProfile
    rows = [r for r in chain.rows if r.contract.expiration == expiry]
    if not rows:
        return None
    filtered = ChainSnapshot(
        underlying=chain.underlying,
        underlying_price=chain.underlying_price,
        timestamp=chain.timestamp,
        rows=rows,
    )
    return build_gex_profile(filtered)


class TerminalPoller:
    """Periodically refresh per-symbol analytics into the StateStore."""

    def __init__(self, settings: Settings, adapter: DataAdapter, store: StateStore) -> None:
        self.settings = settings
        self.adapter = adapter
        self.store = store
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop_event.clear()
            self._task = asyncio.create_task(self._run(), name="terminal-poller")
            log.info("poller started", provider=self.adapter.name)

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task:
            try:
                await asyncio.wait_for(self._task, timeout=5.0)
            except TimeoutError:
                self._task.cancel()

    async def _run(self) -> None:
        # Initial refresh ASAP so the UI has data on first connect
        await self._refresh_all()
        while not self._stop_event.is_set():
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(),
                    timeout=self.settings.chain_poll_interval_seconds,
                )
            except TimeoutError:
                await self._refresh_all()

    async def _refresh_all(self) -> None:
        await asyncio.gather(
            *(self._refresh_symbol(s) for s in self.settings.symbol_list),
            return_exceptions=True,
        )

    async def _refresh_symbol(self, symbol: str) -> None:
        try:
            chain = await self.adapter.get_chain(symbol)
            if not chain.rows or chain.underlying_price <= 0:
                log.warning("empty chain", symbol=symbol)
                return
            snapshot = await self._build_terminal_snapshot(symbol, chain)
            await self.store.update_snapshot(snapshot)
            await self.store.push_flow(snapshot.recent_flow)
            log.info(
                "snapshot updated",
                symbol=symbol,
                rows=len(chain.rows),
                regime=snapshot.regime.regime if snapshot.regime else None,
            )
        except Exception as exc:
            log.error("refresh failed", symbol=symbol, error=str(exc))

    async def _build_terminal_snapshot(
        self, symbol: str, raw_chain: ChainSnapshot
    ) -> TerminalSnapshot:
        # Step 1: compute greeks + per-contract exposures
        enriched_rows = enrich_chain(
            [r.contract for r in raw_chain.rows],
            raw_chain.underlying_price,
            risk_free_rate=self.settings.risk_free_rate,
            now=raw_chain.timestamp,
        )
        chain = ChainSnapshot(
            underlying=raw_chain.underlying,
            underlying_price=raw_chain.underlying_price,
            timestamp=raw_chain.timestamp,
            rows=enriched_rows,
        )
        # Step 2: aggregate GEX/DEX/Vanna/Charm at the strike level (all + per-expiry)
        gex = build_gex_profile(chain)
        sorted_expiries = sorted({r.contract.expiration for r in chain.rows})
        gex_0dte = _gex_for_expiry(chain, sorted_expiries[0]) if len(sorted_expiries) >= 1 else None
        gex_1dte = _gex_for_expiry(chain, sorted_expiries[1]) if len(sorted_expiries) >= 2 else None
        # Step 3: IV/skew/term-structure with historical context
        closes = await self.adapter.get_historical_close(symbol, days=60)
        rv = realized_vol(closes, window=20) if closes else None
        iv = build_iv_summary(chain, iv_history=None, realized_vol_20d=rv)
        # Step 4: flow events + sentiment + PCR + max pain
        flow_events = detect_flow_events(chain)
        flow_top = rank_unusual_strikes(flow_events, limit=20)
        flow_score = summarize_flow_sentiment(flow_events)
        flow_metrics = compute_flow_metrics(chain)
        # Step 5: regime + key levels + commentary
        vix_price = None
        vvix_price = None
        try:
            vix_price = await self.adapter.get_underlying_price("^VIX")
        except Exception:
            pass
        try:
            vvix_price = await self.adapter.get_underlying_price("^VVIX")
        except Exception:
            pass
        regime = classify(
            gex=gex,
            iv=iv,
            flow_events=flow_events,
            vix=vix_price,
            vvix=vvix_price,
            flow_sentiment_score=flow_score,
            flow_metrics=flow_metrics,
            now=raw_chain.timestamp,
        )
        levels = key_levels_from_gex(gex, max_pain=flow_metrics.max_pain)
        commentary = await build_commentary(regime, gex, iv, flow_top)

        # Step 6: new conditional bias engine (4 timeframes)
        bias = None
        try:
            bias = compute_bias(
                chain=chain,
                gex_profile=gex,
                iv_summary=iv,
                flow_metrics=flow_metrics,
                now=raw_chain.timestamp,
            )
        except Exception as exc:
            log.warning("bias engine failed", symbol=symbol, error=str(exc))

        return TerminalSnapshot(
            underlying=symbol,
            underlying_price=raw_chain.underlying_price,
            timestamp=datetime.now(UTC),
            regime=regime,
            gex=gex,
            gex_0dte=gex_0dte,
            gex_1dte=gex_1dte,
            iv=iv,
            key_levels=levels,
            recent_flow=flow_top,
            commentary=commentary,
            flow_metrics=flow_metrics,
            bias=bias,
        )
