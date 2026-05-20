"""FastAPI entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.adapters import get_adapter
from app.api.routes import router
from app.config import get_settings
from app.logging_config import configure_logging, get_logger
from app.state import get_state
from app.workers.poller import TerminalPoller

log = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    log.info(
        "starting",
        provider=settings.data_provider,
        symbols=settings.symbol_list,
    )

    adapter = get_adapter(settings)
    store = get_state()
    poller = TerminalPoller(settings, adapter, store)
    poller.start()
    app.state.poller = poller
    app.state.adapter = adapter
    try:
        yield
    finally:
        log.info("shutting down")
        await poller.stop()
        await adapter.aclose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Options Flow Terminal",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    return app


app = create_app()
