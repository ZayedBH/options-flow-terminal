"""Options flow event detection from chain snapshots.

Without a real-time trade feed we can't see individual fills, sweeps, or block prints.
What we *can* do with delayed/free data is approximate "unusual options activity":

* compare a contract's daily volume to its prior open interest -> volume/OI ratio
* flag contracts where today's volume is above a configurable absolute threshold
* infer side from the bid/ask side the print landed on (mark vs mid)
* compute notional premium (volume * mark * 100)
* classify as bullish/bearish via option type and side

When a real-time provider (Polygon, Unusual Whales, dxFeed) is wired in, the same
`FlowEvent` schema is produced from trade-conditions tape, and the rest of the system
keeps working unchanged.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterable

from app.schemas import (
    ChainSnapshot,
    FlowEvent,
    FlowEventType,
    FlowSide,
    OptionContract,
    OptionType,
)


def _infer_side(contract: OptionContract) -> FlowSide:
    """Heuristic: if mark sits closer to ask, treat as buyer-initiated; closer to bid, seller."""
    if contract.bid is None or contract.ask is None or contract.bid <= 0 or contract.ask <= 0:
        return FlowSide.NEUTRAL
    mid = (contract.bid + contract.ask) / 2
    last = contract.last
    if last is None or last <= 0:
        return FlowSide.NEUTRAL
    if last >= mid + (contract.ask - mid) * 0.5:
        # Buyer-initiated
        return FlowSide.BULLISH if contract.option_type == OptionType.CALL else FlowSide.BEARISH
    if last <= mid - (mid - contract.bid) * 0.5:
        # Seller-initiated
        return FlowSide.BEARISH if contract.option_type == OptionType.CALL else FlowSide.BULLISH
    return FlowSide.NEUTRAL


def _classify_event(
    contract: OptionContract, premium: float, vol_oi_ratio: float
) -> FlowEventType:
    if premium >= 1_000_000:
        return FlowEventType.BLOCK
    if vol_oi_ratio >= 5.0:
        return FlowEventType.UNUSUAL
    if premium >= 250_000:
        return FlowEventType.LARGE
    return FlowEventType.SWEEP


def detect_flow_events(
    chain: ChainSnapshot,
    *,
    min_premium: float = 50_000.0,
    min_volume: int = 100,
    min_vol_oi_ratio: float = 1.5,
) -> list[FlowEvent]:
    """Surface notable contracts from a chain snapshot as FlowEvents."""
    events: list[FlowEvent] = []
    for row in chain.rows:
        c = row.contract
        if c.volume < min_volume:
            continue
        mark = c.mark
        if mark is None or mark <= 0:
            continue
        oi = max(c.open_interest, 1)
        vol_oi = c.volume / oi
        premium = c.volume * mark * 100.0
        if premium < min_premium and vol_oi < min_vol_oi_ratio:
            continue
        side = _infer_side(c)
        event_type = _classify_event(c, premium, vol_oi)
        events.append(
            FlowEvent(
                id=str(uuid.uuid4()),
                underlying=c.underlying,
                symbol=c.symbol,
                expiration=c.expiration,
                strike=c.strike,
                option_type=c.option_type,
                side=side,
                event_type=event_type,
                premium=premium,
                size=c.volume,
                price=mark,
                underlying_price=chain.underlying_price,
                iv=c.implied_volatility,
                timestamp=chain.timestamp,
                note=f"vol/OI={vol_oi:.2f}",
            )
        )
    events.sort(key=lambda e: e.premium, reverse=True)
    return events


def rank_unusual_strikes(events: Iterable[FlowEvent], limit: int = 10) -> list[FlowEvent]:
    """Group repeated strike activity and return top-N events per strike."""
    by_strike: dict[tuple[str, float, str], list[FlowEvent]] = {}
    for e in events:
        key = (e.underlying, e.strike, e.option_type.value)
        by_strike.setdefault(key, []).append(e)
    aggregated: list[FlowEvent] = []
    for _, group in by_strike.items():
        group.sort(key=lambda x: x.premium, reverse=True)
        aggregated.extend(group[:3])
    aggregated.sort(key=lambda e: e.premium, reverse=True)
    return aggregated[:limit]


def summarize_flow_sentiment(events: list[FlowEvent]) -> float:
    """Return a -100..100 score from bullish vs bearish notional."""
    if not events:
        return 0.0
    bull = sum(e.premium for e in events if e.side == FlowSide.BULLISH)
    bear = sum(e.premium for e in events if e.side == FlowSide.BEARISH)
    total = bull + bear
    if total <= 0:
        return 0.0
    score = (bull - bear) / total * 100.0
    return float(max(-100.0, min(100.0, score)))
