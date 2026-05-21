"""Adapter selection from configuration."""
from __future__ import annotations

from app.adapters.base import DataAdapter
from app.config import Settings


def get_adapter(settings: Settings) -> DataAdapter:
    """Return a configured DataAdapter for the active provider."""
    provider = (settings.data_provider or "yfinance").lower()
    if provider == "polygon":
        from app.adapters.polygon_adapter import PolygonAdapter

        if not settings.polygon_api_key:
            raise RuntimeError("DATA_PROVIDER=polygon but POLYGON_API_KEY not set")
        return PolygonAdapter(settings.polygon_api_key)
    if provider == "yfinance":
        from app.adapters.yfinance_adapter import YFinanceAdapter

        return YFinanceAdapter()
    raise RuntimeError(f"Unknown DATA_PROVIDER={provider!r}")
