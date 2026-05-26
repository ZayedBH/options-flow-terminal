"""Options flow event detection from chain snapshots.

Without a real-time trade feed we can't see individual fills, sweeps, or block prints.
What we *can* do with delayed/free data is approximate "unusual options activity":

* compare a contract's daily volume to its prior open interest -> volume/OI ratio
* flag contracts where today's volume is above a configurable absolute threshold
* infer side from the bid/ask side the print landed on (mark vs mid)
* compute notional premium (volume * mark * 100)
* classify as bullish/bearish via option type and side

Flow type sentiment weighting:
  UNUSUAL  2.0×  — vol/OI explosion signals fresh directional conviction
  SWEEP    1.5×  — market order aggression, strong directional intent
  LARGE    1.0×  — baseline
  BLOCK    0.8×  — could be a hedge, roll, or close; discounted

When a real-time provider (Polygon, Unusual Whales, dxFeed) is wired in, the same
`FlowEvent` schema is produced from trade-conditions tape, and the rest of the system
keeps working unchanged.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import date

from app.schemas import (
    ChainSnapshot,
    FlowEvent,
    FlowEventType,
    FlowMetrics,
    FlowSide,
    OptionContract,
    OptionType,
)

# ─── Type-based sentiment multipliers ────────────────────────────────────────
# Sweeps are aggressive market orders → highest weight
# Unusual = vol/OI explosion → fresh directional positioning → very high weight
# Large = notable but ambiguous direction → baseline
# Block = could be a hedge, roll, or close → discounted

_TYPE_WEIGHT: dict[FlowEventType, float] = {
    FlowEventType.UNUSUAL: 2.0,
    FlowEventType.SWEEP:   1.5,
    FlowEventType.LARGE:   1.0,
    FlowEventType.BLOCK:   0.8,
}


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
    """Return a -100..100 score from bullish vs bearish weighted notional.

    Weighting:
      UNUSUAL 2.0× — vol/OI explosion, fresh directional conviction
      SWEEP   1.5× — market-order aggression
      LARGE   1.0× — baseline
      BLOCK   0.8× — hedges/rolls discounted
    """
    if not events:
        return 0.0
    bull = 0.0
    bear = 0.0
    for e in events:
        weight = _TYPE_WEIGHT.get(e.event_type, 1.0)
        weighted_premium = e.premium * weight
        if e.side == FlowSide.BULLISH:
            bull += weighted_premium
        elif e.side == FlowSide.BEARISH:
            bear += weighted_premium
    total = bull + bear
    if total <= 0:
        return 0.0
    return float(max(-100.0, min(100.0, (bull - bear) / total * 100.0)))


def zero_dte_premium_ratio(events: list[FlowEvent], today: date) -> float:
    """Fraction of total flow premium expiring today (0DTE).  Returns 0..1.

    High ratio (>0.4) = flow dominated by gamma-driven intraday speculation.
    Very high (>0.6) = explosive/binary intraday conditions likely.
    """
    if not events:
        return 0.0
    total = sum(e.premium for e in events)
    if total <= 0:
        return 0.0
    dte0 = sum(e.premium for e in events if e.expiration == today)
    return dte0 / total


def _max_pain(by_strike: dict[float, tuple[int, int]]) -> float | None:
    """Strike that minimizes total intrinsic value of all outstanding options (max pain).

    by_strike: {strike -> (call_oi, put_oi)}
    """
    strikes = sorted(by_strike.keys())
    if not strikes:
        return None
    min_pain = float("inf")
    result = strikes[0]
    for target in strikes:
        pain = 0.0
        for k, (call_oi, put_oi) in by_strike.items():
            if target > k:          # calls are ITM at this target
                pain += (target - k) * call_oi
            elif target < k:        # puts are ITM at this target
                pain += (k - target) * put_oi
        if pain < min_pain:
            min_pain = pain
            result = target
    return float(result)


def compute_flow_metrics(chain: ChainSnapshot) -> FlowMetrics:
    """PCR (OI + vol) and max-pain level from the full options chain."""
    call_oi = call_vol = put_oi = put_vol = 0
    by_strike: dict[float, tuple[int, int]] = {}   # {strike: (call_oi, put_oi)}

    for row in chain.rows:
        c = row.contract
        oi = max(0, c.open_interest)
        vol = max(0, c.volume)
        k = c.strike
        cur_c, cur_p = by_strike.get(k, (0, 0))
        if c.option_type == OptionType.CALL:
            call_oi += oi
            call_vol += vol
            by_strike[k] = (cur_c + oi, cur_p)
        else:
            put_oi += oi
            put_vol += vol
            by_strike[k] = (cur_c, cur_p + oi)

    return FlowMetrics(
        pcr_oi=round(put_oi / call_oi, 3) if call_oi > 0 else None,
        pcr_vol=round(put_vol / call_vol, 3) if call_vol > 0 else None,
        total_call_oi=call_oi,
        total_put_oi=put_oi,
        total_call_vol=call_vol,
        total_put_vol=put_vol,
        max_pain=_max_pain(by_strike),
    )
