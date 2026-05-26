"""HTTP API: REST snapshots + WebSocket fan-out."""
from __future__ import annotations

import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect

from app.config import Settings, get_settings
from app.state import StateStore, get_state

router = APIRouter()


def _store() -> StateStore:
    return get_state()


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/config")
async def config(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
    return {
        "symbols": settings.symbol_list,
        "futures_symbols": settings.futures_symbol_list,
        "data_provider": settings.data_provider,
        "chain_poll_interval_seconds": settings.chain_poll_interval_seconds,
    }


@router.get("/symbols")
async def symbols(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
    return {
        "equity_index": settings.symbol_list,
        "futures": settings.futures_symbol_list,
    }


@router.get("/snapshot/{symbol}")
async def snapshot(symbol: str) -> dict:
    store = _store()
    snap = store.get_snapshot(symbol.upper())
    if snap is None:
        raise HTTPException(404, f"No snapshot for {symbol}")
    return snap.model_dump(mode="json")


@router.get("/snapshots")
async def all_snapshots() -> list[dict]:
    store = _store()
    return [s.model_dump(mode="json") for s in store.list_snapshots()]


@router.get("/flow/{symbol}")
async def flow(symbol: str, limit: int = Query(100, ge=1, le=500)) -> list[dict]:
    store = _store()
    events = store.get_flow(symbol.upper(), limit=limit)
    return [e.model_dump(mode="json") for e in events]


@router.get("/history/{symbol}")
async def gex_history(symbol: str) -> list[dict]:
    """Intraday GEX history for a symbol (up to 8 hours, ~480 points at 60s cadence)."""
    store = _store()
    return store.get_gex_history(symbol.upper())


@router.get("/macro")
async def macro_data(request: Request, settings: Annotated[Settings, Depends(get_settings)]) -> dict:
    """Macro indicators, Fed balance sheet (requires FRED_API_KEY), and news from RSS."""
    from app.analytics.macro import get_macro_snapshot
    adapter = request.app.state.adapter
    return await get_macro_snapshot(adapter, fred_api_key=settings.fred_api_key)


@router.get("/futures-prices")
async def futures_prices(request: Request) -> dict:
    """Live spot prices for ES=F and NQ=F — used by FOOTS strike translation."""
    from app.adapters import DataAdapter
    adapter: DataAdapter = request.app.state.adapter
    result: dict[str, float | None] = {}
    for sym in ("ES=F", "NQ=F"):
        try:
            result[sym] = await adapter.get_underlying_price(sym)
        except Exception:
            result[sym] = None
    return result


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    """Live snapshot + flow stream. The client receives an initial state dump
    on connect and incremental updates thereafter."""
    await ws.accept()
    store = _store()

    # Initial state
    try:
        await ws.send_text(
            json.dumps(
                {
                    "type": "initial",
                    "snapshots": [s.model_dump(mode="json") for s in store.list_snapshots()],
                }
            )
        )
    except WebSocketDisconnect:
        return

    async with store.subscribe() as queue:
        try:
            while True:
                msg = await queue.get()
                await ws.send_text(json.dumps(msg, default=str))
        except WebSocketDisconnect:
            return
        except asyncio.CancelledError:
            return
