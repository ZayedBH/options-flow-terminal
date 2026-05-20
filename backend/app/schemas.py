"""Pydantic schemas shared between adapters, analytics, and the API."""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field


class OptionType(str, Enum):
    CALL = "call"
    PUT = "put"


class OptionContract(BaseModel):
    """A single option contract snapshot at a point in time."""

    symbol: str
    underlying: str
    expiration: date
    strike: float
    option_type: OptionType

    bid: float | None = None
    ask: float | None = None
    last: float | None = None
    mid: float | None = None
    volume: int = 0
    open_interest: int = 0
    implied_volatility: float | None = None

    underlying_price: float | None = None
    timestamp: datetime

    @property
    def mark(self) -> float | None:
        """Best available price estimate."""
        if self.mid is not None:
            return self.mid
        if self.bid is not None and self.ask is not None and self.bid > 0 and self.ask > 0:
            return (self.bid + self.ask) / 2
        return self.last


class GreeksSnapshot(BaseModel):
    """Computed greeks for a single contract."""

    delta: float
    gamma: float
    theta: float
    vega: float
    rho: float
    vanna: float
    charm: float
    vomma: float


class ContractRow(BaseModel):
    """OptionContract enriched with computed greeks + exposures."""

    contract: OptionContract
    greeks: GreeksSnapshot | None = None
    gex: float = 0.0  # gamma exposure in $ per 1% move
    dex: float = 0.0  # delta exposure in $
    vex: float = 0.0  # vega exposure in $ per 1 vol point
    vanna_exposure: float = 0.0
    charm_exposure: float = 0.0


class ChainSnapshot(BaseModel):
    """Full options chain snapshot for a single underlying."""

    underlying: str
    underlying_price: float
    timestamp: datetime
    rows: list[ContractRow] = Field(default_factory=list)


class GEXLevel(BaseModel):
    """Aggregated exposures at a single strike."""

    strike: float
    call_gex: float = 0.0
    put_gex: float = 0.0
    net_gex: float = 0.0
    call_oi: int = 0
    put_oi: int = 0
    net_dex: float = 0.0


class GEXProfile(BaseModel):
    """Strike-by-strike GEX profile + summary stats."""

    underlying: str
    underlying_price: float
    timestamp: datetime
    levels: list[GEXLevel] = Field(default_factory=list)
    total_gex: float = 0.0
    total_dex: float = 0.0
    total_vex: float = 0.0
    total_vanna: float = 0.0
    total_charm: float = 0.0
    gamma_flip: float | None = None
    largest_call_wall: float | None = None
    largest_put_wall: float | None = None
    dealer_state: str = "unknown"  # 'long_gamma' | 'short_gamma' | 'neutral'


class IVSummary(BaseModel):
    """IV statistics for an underlying."""

    underlying: str
    timestamp: datetime
    atm_iv: float | None = None
    iv_30d: float | None = None
    iv_rank: float | None = None  # 0..100
    iv_percentile: float | None = None  # 0..100
    realized_vol_20d: float | None = None
    skew_25d: float | None = None  # 25-delta put IV - 25-delta call IV
    term_structure: dict[str, float] = Field(default_factory=dict)  # tenor_label -> atm_iv
    state: str = "normal"  # 'compression' | 'expansion' | 'crush' | 'normal'


class FlowEventType(str, Enum):
    SWEEP = "sweep"
    BLOCK = "block"
    LARGE = "large"
    UNUSUAL = "unusual"


class FlowSide(str, Enum):
    BULLISH = "bullish"
    BEARISH = "bearish"
    NEUTRAL = "neutral"


class FlowEvent(BaseModel):
    """A single notable options flow event."""

    id: str
    underlying: str
    symbol: str
    expiration: date
    strike: float
    option_type: OptionType
    side: FlowSide
    event_type: FlowEventType
    premium: float
    size: int
    price: float
    underlying_price: float
    iv: float | None = None
    timestamp: datetime
    note: str | None = None


class KeyLevel(BaseModel):
    """A notable price level (support/resistance/magnet/flip)."""

    price: float
    label: str
    kind: str  # 'gamma_flip' | 'call_wall' | 'put_wall' | 'magnet' | 'dealer_support' | 'dealer_resistance' | 'vwap' | 'high_volume_node'
    strength: float = 1.0  # relative weight 0..1
    note: str | None = None


class RegimeClassification(BaseModel):
    """High-level regime classification + bias outputs."""

    underlying: str
    timestamp: datetime
    regime: str
    confidence: float  # 0..1
    intraday_bias: str
    daily_bias: str
    weekly_bias: str
    volatility_state: str
    expected_move_1d: float | None = None
    expected_move_1w: float | None = None
    sentiment_score: float  # -100..100
    gamma_squeeze_risk: float  # 0..1
    mean_reversion_score: float  # 0..1
    trend_continuation_score: float  # 0..1
    notes: list[str] = Field(default_factory=list)


class TerminalSnapshot(BaseModel):
    """Composite snapshot used to push state to the UI."""

    underlying: str
    underlying_price: float
    timestamp: datetime
    regime: RegimeClassification | None = None
    gex: GEXProfile | None = None
    iv: IVSummary | None = None
    key_levels: list[KeyLevel] = Field(default_factory=list)
    recent_flow: list[FlowEvent] = Field(default_factory=list)
    commentary: str | None = None
