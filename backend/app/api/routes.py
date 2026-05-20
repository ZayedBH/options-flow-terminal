"""HTTP API: REST snapshots + WebSocket fan-out."""
from __future__ import annotations

import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect

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
