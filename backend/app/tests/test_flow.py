"""Flow detection tests."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from app.analytics.flow import (
    detect_flow_events,
    summarize_flow_sentiment,
)
from app.schemas import ChainSnapshot, ContractRow, OptionContract, OptionType


def _row(
    strike: float,
    opt_type: OptionType,
    *,
    bid: float,
    ask: float,
    last: float,
    volume: int,
    oi: int,
) -> ContractRow:
    c = OptionContract(
        symbol=f"X{strike}{opt_type.value}",
        underlying="X",
        expiration=date.today() + timedelta(days=30),
        strike=strike,
        option_type=opt_type,
        bid=bid,
        ask=ask,
        last=last,
        mid=(bid + ask) / 2 if bid > 0 and ask > 0 else None,
        volume=volume,
        open_interest=oi,
        implied_volatility=0.25,
        underlying_price=100.0,
        timestamp=datetime.now(UTC),
    )
    return ContractRow(contract=c)


def test_detect_flow_filters_low_premium() -> None:
    chain = ChainSnapshot(
        underlying="X",
        underlying_price=100.0,
        timestamp=datetime.now(UTC),
        rows=[_row(100, OptionType.CALL, bid=0.5, ask=0.6, last=0.55, volume=10, oi=100)],
    )
    events = detect_flow_events(chain, min_premium=50_000.0)
    assert events == []


def test_detect_flow_surfaces_large_premium() -> None:
    chain = ChainSnapshot(
        underlying="X",
        underlying_price=100.0,
        timestamp=datetime.now(UTC),
        rows=[
            _row(100, OptionType.CALL, bid=2.0, ask=2.2, last=2.2, volume=5000, oi=2000),
            _row(95, OptionType.PUT, bid=1.8, ask=2.0, last=1.8, volume=4000, oi=1000),
        ],
    )
    events = detect_flow_events(chain)
    assert len(events) == 2
    # Buyer-initiated call at ask → bullish
    call_event = next(e for e in events if e.option_type == OptionType.CALL)
    assert call_event.side.value == "bullish"
    # Seller-initiated put at bid → bullish (selling puts is bullish)
    put_event = next(e for e in events if e.option_type == OptionType.PUT)
    assert put_event.side.value == "bullish"


def test_sentiment_score_bounded() -> None:
    chain = ChainSnapshot(
        underlying="X",
        underlying_price=100.0,
        timestamp=datetime.now(UTC),
        rows=[
            _row(100, OptionType.CALL, bid=2.0, ask=2.2, last=2.2, volume=5000, oi=2000),
        ],
    )
    events = detect_flow_events(chain)
    score = summarize_flow_sentiment(events)
    assert -100.0 <= score <= 100.0
