"""Abstract data adapter interface.

All providers (yfinance, Polygon, Tradier, Unusual Whales, dxFeed) implement this
shape. The rest of the system depends only on `DataAdapter` so we can swap in any
provider without changes elsewhere.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas import ChainSnapshot, FlowEvent


class DataAdapter(ABC):
    """Abstract base class for market data providers."""

    name: str = "base"

    @abstractmethod
    async def get_underlying_price(self, symbol: str) -> float | None:
        """Latest underlying price (delayed or real-time depending on tier)."""

    @abstractmethod
    async def get_chain(self, symbol: str, expirations: int = 6) -> ChainSnapshot:
        """Snapshot of the next `expirations` expiries' worth of contracts."""

    async def get_historical_close(self, symbol: str, days: int = 60) -> list[float]:
        """Historical close prices for realized vol calculations. Optional override."""
        return []

    async def get_recent_flow(self, symbol: str) -> list[FlowEvent]:
        """Real-time tape (sweeps, blocks). Adapters without tape return []."""
        return []

    async def aclose(self) -> None:
        """Release any resources held by the adapter."""

    @property
    def supports_realtime_tape(self) -> bool:
        return False
