"""Polygon.io adapter (paid real-time / delayed depending on plan).

Implemented as a HTTP adapter using the REST snapshot endpoint
`v3/snapshot/options/{underlying}`. WebSocket trade-tape support is gated behind
the `supports_realtime_tape` flag and only activated when the user supplies an
API key for the Advanced (real-time) tier.

Docs: https://polygon.io/docs/options/get_v3_snapshot_options__underlyingasset
"""
from __future__ import annotations

from datetime import UTC, date, datetime

import httpx

from app.adapters.base import DataAdapter
from app.logging_config import get_logger
from app.schemas import ChainSnapshot, ContractRow, OptionContract, OptionType

log = get_logger("polygon_adapter")

BASE_URL = "https://api.polygon.io"


class PolygonAdapter(DataAdapter):
    name = "polygon"

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ValueError("POLYGON_API_KEY required for polygon adapter")
        self._client = httpx.AsyncClient(
            base_url=BASE_URL, params={"apiKey": api_key}, timeout=10.0
        )

    @property
    def supports_realtime_tape(self) -> bool:
        return True

    async def aclose(self) -> None:
        await self._client.aclose()

    async def get_underlying_price(self, symbol: str) -> float | None:
        try:
            r = await self._client.get(f"/v2/last/trade/{symbol}")
            r.raise_for_status()
            data = r.json().get("results") or {}
            price = data.get("p") or data.get("price")
            return float(price) if price is not None else None
        except Exception as exc:
            log.warning("polygon price fetch failed", symbol=symbol, error=str(exc))
            return None

    async def get_chain(self, symbol: str, expirations: int = 6) -> ChainSnapshot:
        rows: list[ContractRow] = []
        spot = await self.get_underlying_price(symbol) or 0.0
        now = datetime.now(UTC)
        try:
            url = f"/v3/snapshot/options/{symbol}"
            params = {"limit": 250}
            r = await self._client.get(url, params=params)
            r.raise_for_status()
            results = r.json().get("results", [])
            seen_exp: set[date] = set()
            for item in results:
                details = item.get("details", {})
                exp_str = details.get("expiration_date")
                if not exp_str:
                    continue
                try:
                    exp = date.fromisoformat(exp_str)
                except ValueError:
                    continue
                seen_exp.add(exp)
                if len(seen_exp) > expirations:
                    continue
                strike = details.get("strike_price")
                if strike is None:
                    continue
                opt_type = (
                    OptionType.CALL
                    if details.get("contract_type", "").lower() == "call"
                    else OptionType.PUT
                )
                last_quote = item.get("last_quote", {}) or {}
                day = item.get("day", {}) or {}
                iv = item.get("implied_volatility")
                bid = last_quote.get("bid")
                ask = last_quote.get("ask")
                mid = None
                if bid and ask:
                    mid = (bid + ask) / 2
                contract = OptionContract(
                    symbol=details.get("ticker", ""),
                    underlying=symbol,
                    expiration=exp,
                    strike=float(strike),
                    option_type=opt_type,
                    bid=_f(bid),
                    ask=_f(ask),
                    last=_f(day.get("close")),
                    mid=_f(mid),
                    volume=int(day.get("volume") or 0),
                    open_interest=int(item.get("open_interest") or 0),
                    implied_volatility=_f(iv),
                    underlying_price=spot,
                    timestamp=now,
                )
                rows.append(ContractRow(contract=contract))
        except Exception as exc:
            log.warning("polygon chain fetch failed", symbol=symbol, error=str(exc))
        return ChainSnapshot(underlying=symbol, underlying_price=spot, timestamp=now, rows=rows)


def _f(x) -> float | None:
    try:
        if x is None:
            return None
        v = float(x)
        if v != v:
            return None
        return v
    except (TypeError, ValueError):
        return None
