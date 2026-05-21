"""yfinance adapter (free, 15-min delayed Yahoo data).

yfinance is synchronous; we run blocking calls in a thread executor and cache
chain results for ~CHAIN_POLL_INTERVAL_SECONDS to avoid hammering Yahoo (they
rate-limit aggressively).
"""
from __future__ import annotations

import asyncio
import time
from datetime import UTC, date, datetime

import pandas as pd

from app.adapters.base import DataAdapter
from app.logging_config import get_logger
from app.schemas import (
    ChainSnapshot,
    ContractRow,
    OptionContract,
    OptionType,
)

log = get_logger("yfinance_adapter")

_CACHE_TTL_SECONDS = 60


class YFinanceAdapter(DataAdapter):
    name = "yfinance"

    def __init__(self) -> None:
        import yfinance as yf  # imported lazily so test envs without it still load

        self._yf = yf
        self._price_cache: dict[str, tuple[float, float]] = {}  # symbol -> (ts, price)
        self._chain_cache: dict[str, tuple[float, ChainSnapshot]] = {}
        self._hist_cache: dict[str, tuple[float, list[float]]] = {}

    def _now(self) -> datetime:
        return datetime.now(UTC)

    def _ticker_symbol(self, symbol: str) -> str:
        # Yahoo uses ^SPX for the SPX index
        if symbol.upper() == "SPX":
            return "^SPX"
        if symbol.upper() == "VIX":
            return "^VIX"
        return symbol

    async def get_underlying_price(self, symbol: str) -> float | None:
        cached = self._price_cache.get(symbol)
        if cached and time.time() - cached[0] < 10:
            return cached[1]
        price = await asyncio.to_thread(self._fetch_price, symbol)
        if price is not None:
            self._price_cache[symbol] = (time.time(), price)
        return price

    def _fetch_price(self, symbol: str) -> float | None:
        try:
            t = self._yf.Ticker(self._ticker_symbol(symbol))
            info = t.fast_info
            for key in ("last_price", "lastPrice", "regular_market_price"):
                val = info.get(key) if hasattr(info, "get") else getattr(info, key, None)
                if val is not None:
                    return float(val)
            hist = t.history(period="1d", interval="1m")
            if not hist.empty:
                return float(hist["Close"].iloc[-1])
        except Exception as exc:
            log.warning("yfinance price fetch failed", symbol=symbol, error=str(exc))
        return None

    async def get_chain(self, symbol: str, expirations: int = 6) -> ChainSnapshot:
        cached = self._chain_cache.get(symbol)
        if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
            return cached[1]
        snap = await asyncio.to_thread(self._fetch_chain, symbol, expirations)
        if snap is not None:
            self._chain_cache[symbol] = (time.time(), snap)
            return snap
        return ChainSnapshot(
            underlying=symbol,
            underlying_price=0.0,
            timestamp=self._now(),
            rows=[],
        )

    def _fetch_chain(self, symbol: str, expirations: int) -> ChainSnapshot | None:
        try:
            t = self._yf.Ticker(self._ticker_symbol(symbol))
            spot = self._fetch_price(symbol) or 0.0
            exps = list(t.options or [])[:expirations]
            rows: list[ContractRow] = []
            now = self._now()
            for exp_str in exps:
                try:
                    exp_date = date.fromisoformat(exp_str)
                except ValueError:
                    continue
                try:
                    chain = t.option_chain(exp_str)
                except Exception as exc:
                    log.warning(
                        "option_chain fetch failed", symbol=symbol, exp=exp_str, error=str(exc)
                    )
                    continue
                rows.extend(self._rows_from_df(chain.calls, symbol, exp_date, OptionType.CALL, spot, now))
                rows.extend(self._rows_from_df(chain.puts, symbol, exp_date, OptionType.PUT, spot, now))
            contracts = [r.contract for r in rows]
            return ChainSnapshot(
                underlying=symbol,
                underlying_price=spot,
                timestamp=now,
                rows=[ContractRow(contract=c) for c in contracts],
            )
        except Exception as exc:
            log.warning("chain fetch failed", symbol=symbol, error=str(exc))
            return None

    @staticmethod
    def _rows_from_df(
        df: pd.DataFrame,
        underlying: str,
        expiration: date,
        opt_type: OptionType,
        spot: float,
        ts: datetime,
    ) -> list[ContractRow]:
        if df is None or df.empty:
            return []
        out: list[ContractRow] = []
        for _, r in df.iterrows():
            try:
                strike = float(r.get("strike", 0) or 0)
                if strike <= 0:
                    continue
                bid = _safe_float(r.get("bid"))
                ask = _safe_float(r.get("ask"))
                last = _safe_float(r.get("lastPrice"))
                vol = _safe_int(r.get("volume"))
                oi = _safe_int(r.get("openInterest"))
                iv = _safe_float(r.get("impliedVolatility"))
                mid: float | None = None
                if bid is not None and ask is not None and bid > 0 and ask > 0:
                    mid = (bid + ask) / 2
                contract = OptionContract(
                    symbol=str(r.get("contractSymbol", "")),
                    underlying=underlying,
                    expiration=expiration,
                    strike=strike,
                    option_type=opt_type,
                    bid=bid,
                    ask=ask,
                    last=last,
                    mid=mid,
                    volume=vol,
                    open_interest=oi,
                    implied_volatility=iv,
                    underlying_price=spot,
                    timestamp=ts,
                )
                out.append(ContractRow(contract=contract))
            except Exception as exc:
                log.debug("skipping bad row", error=str(exc))
                continue
        return out

    async def get_historical_close(self, symbol: str, days: int = 60) -> list[float]:
        cached = self._hist_cache.get(symbol)
        if cached and time.time() - cached[0] < 3600:
            return cached[1]
        closes = await asyncio.to_thread(self._fetch_history, symbol, days)
        self._hist_cache[symbol] = (time.time(), closes)
        return closes

    def _fetch_history(self, symbol: str, days: int) -> list[float]:
        try:
            t = self._yf.Ticker(self._ticker_symbol(symbol))
            df = t.history(period=f"{max(days, 30)}d")
            if df.empty:
                return []
            return [float(x) for x in df["Close"].tolist()]
        except Exception as exc:
            log.warning("history fetch failed", symbol=symbol, error=str(exc))
            return []


def _safe_float(x) -> float | None:
    try:
        if x is None:
            return None
        f = float(x)
        if f != f:  # NaN
            return None
        return f
    except (TypeError, ValueError):
        return None


def _safe_int(x, default: int = 0) -> int:
    try:
        if x is None:
            return default
        f = float(x)
        if f != f:  # NaN
            return default
        return int(f)
    except (TypeError, ValueError):
        return default
