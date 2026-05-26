"""In-memory snapshot store + pub/sub fan-out used by the API and WebSocket.

We deliberately keep this in-process rather than going through Redis on every read
because the data is single-writer (the poller) and many-reader (HTTP/WS). Redis
is still used for cross-process persistence + future horizontal scaling — see
`redis_publisher.py` (placeholder).
"""
from __future__ import annotations

import asyncio
from collections import deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from app.schemas import FlowEvent, TerminalSnapshot


_GEX_HISTORY_MAXLEN = 480  # 8 hours @ 60-second polls


class StateStore:
    """Latest TerminalSnapshot per underlying + a sliding flow tape + GEX history."""

    def __init__(self, flow_buffer_size: int = 200) -> None:
        self._snapshots: dict[str, TerminalSnapshot] = {}
        self._flow_tape: dict[str, deque[FlowEvent]] = {}
        self._flow_buffer_size = flow_buffer_size
        # GEX history: symbol -> deque of {ts, total_gex, gamma_flip, dealer_state}
        self._gex_history: dict[str, deque[dict]] = {}
        self._subscribers: set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()

    async def update_snapshot(self, snapshot: TerminalSnapshot) -> None:
        async with self._lock:
            self._snapshots[snapshot.underlying] = snapshot
            # Append to GEX history ring buffer
            if snapshot.gex is not None:
                buf = self._gex_history.setdefault(
                    snapshot.underlying,
                    deque(maxlen=_GEX_HISTORY_MAXLEN),
                )
                buf.append({
                    "ts": snapshot.timestamp.isoformat(),
                    "total_gex": snapshot.gex.total_gex,
                    "gamma_flip": snapshot.gex.gamma_flip,
                    "dealer_state": snapshot.gex.dealer_state,
                })
        await self._broadcast({"type": "snapshot", "data": snapshot.model_dump(mode="json")})

    async def push_flow(self, events: list[FlowEvent]) -> None:
        if not events:
            return
        async with self._lock:
            for e in events:
                buf = self._flow_tape.setdefault(
                    e.underlying, deque(maxlen=self._flow_buffer_size)
                )
                buf.appendleft(e)
        await self._broadcast(
            {"type": "flow", "data": [e.model_dump(mode="json") for e in events]}
        )

    def get_snapshot(self, symbol: str) -> TerminalSnapshot | None:
        return self._snapshots.get(symbol)

    def list_snapshots(self) -> list[TerminalSnapshot]:
        return list(self._snapshots.values())

    def get_gex_history(self, symbol: str) -> list[dict]:
        """Return the intraday GEX history for a symbol, oldest-first."""
        buf = self._gex_history.get(symbol)
        if not buf:
            return []
        return list(buf)

    def get_flow(self, symbol: str, limit: int = 100) -> list[FlowEvent]:
        buf = self._flow_tape.get(symbol)
        if not buf:
            return []
        return list(buf)[:limit]

    async def _broadcast(self, message: dict) -> None:
        dead: list[asyncio.Queue] = []
        for q in self._subscribers:
            try:
                q.put_nowait(message)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self._subscribers.discard(q)

    @asynccontextmanager
    async def subscribe(self) -> AsyncIterator[asyncio.Queue]:
        q: asyncio.Queue = asyncio.Queue(maxsize=128)
        self._subscribers.add(q)
        try:
            yield q
        finally:
            self._subscribers.discard(q)


_store: StateStore | None = None


def get_state() -> StateStore:
    global _store
    if _store is None:
        _store = StateStore()
    return _store
