"""Application configuration loaded from environment variables."""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Values come from environment / .env file."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    backend_port: int = Field(default=8000)
    log_level: str = Field(default="INFO")

    data_provider: str = Field(default="yfinance")
    polygon_api_key: str | None = Field(default=None)
    tradier_api_key: str | None = Field(default=None)
    unusual_whales_api_key: str | None = Field(default=None)

    openai_api_key: str | None = Field(default=None)
    anthropic_api_key: str | None = Field(default=None)

    symbols: str = Field(default="SPY,QQQ,SPX")
    futures_symbols: str = Field(default="ES=F,NQ=F")

    chain_poll_interval_seconds: int = Field(default=60)
    quote_poll_interval_seconds: int = Field(default=10)

    risk_free_rate: float = Field(default=0.045)

    @property
    def symbol_list(self) -> list[str]:
        return [s.strip().upper() for s in self.symbols.split(",") if s.strip()]

    @property
    def futures_symbol_list(self) -> list[str]:
        return [s.strip().upper() for s in self.futures_symbols.split(",") if s.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
