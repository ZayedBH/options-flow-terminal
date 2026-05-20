"""Rule-based market regime classifier.

The classifier combines four signal families into a single regime label:
    1. Dealer gamma posture (long/short, distance to flip)
    2. Volatility state (compression / expansion / crush / normal)
    3. Flow sentiment (-100..100 from premium-weighted directional flow)
    4. Cross-asset context (VIX level, term-structure slope) when available

It also produces a confidence score, three time-horizon biases, and risk scores
for gamma squeeze, mean reversion, and trend continuation.

This is intentionally rule-based — it's transparent, debuggable, and runs in
microseconds. Swap to ML/ensemble later if desired without changing the
downstream API contract.
"""
from __future__ import annotations

import math
from datetime import UTC, datetime

from app.schemas import (
    FlowEvent,
    GEXProfile,
    IVSummary,
    RegimeClassification,
)


def _bias_for(score: float) -> str:
    """Map a -100..100 score to a discrete bias label."""
    if score >= 60:
        return "Strong Bullish"
    if score >= 25:
        return "Bullish"
    if score >= 10:
        return "Bullish Chop"
    if score > -10:
        return "Neutral Chop"
    if score > -25:
        return "Bearish Chop"
    if score > -60:
        return "Bearish"
    return "Strong Bearish"


def _gamma_squeeze_risk(gex: GEXProfile) -> float:
    """0..1 estimate of squeeze risk.

    Heuristic: short-gamma dealers (negative total GEX) + a large call-wall
    relatively close above spot raises squeeze probability.
    """
    if gex.total_gex >= 0:
        # Long-gamma dealers dampen rather than amplify moves
        return 0.1
    if gex.largest_call_wall is None or gex.underlying_price <= 0:
        return 0.3
    dist_pct = (gex.largest_call_wall - gex.underlying_price) / gex.underlying_price
    if dist_pct < 0:
        return 0.4
    proximity = max(0.0, 1.0 - dist_pct / 0.02)  # within 2% counts strongly
    magnitude = min(1.0, abs(gex.total_gex) / 5e9)
    return float(0.3 + 0.4 * proximity + 0.3 * magnitude)


def _mean_reversion_score(gex: GEXProfile) -> float:
    """Long-gamma dealers tend to suppress trend and favor mean reversion."""
    if gex.total_gex <= 0:
        return 0.2
    magnitude = min(1.0, gex.total_gex / 5e9)
    return float(0.4 + 0.6 * magnitude)


def _trend_continuation_score(gex: GEXProfile, flow_sent: float) -> float:
    if gex.total_gex >= 0:
        base = 0.3
    else:
        # Short gamma + directional flow = chase
        base = 0.6 + min(0.3, abs(flow_sent) / 100.0)
    return float(min(1.0, base))


def _expected_move(spot: float, atm_iv: float | None, days: int) -> float | None:
    if atm_iv is None or spot <= 0 or atm_iv <= 0:
        return None
    return float(spot * atm_iv * math.sqrt(days / 365.0))


def classify(
    *,
    gex: GEXProfile,
    iv: IVSummary,
    flow_events: list[FlowEvent],
    vix: float | None = None,
    flow_sentiment_score: float = 0.0,
    now: datetime | None = None,
) -> RegimeClassification:
    """Combine signals into a regime classification."""
    now = now or datetime.now(UTC)
    spot = gex.underlying_price

    # Base composite score from -100..100
    score = 0.0
    notes: list[str] = []

    # Dealer gamma: long gamma dampens, short gamma amplifies whatever flow says
    if gex.dealer_state == "long_gamma":
        score += 5  # mild positive base — pinning + low realized vol bias
        notes.append("Dealers net long gamma — mean-reversion environment likely.")
    elif gex.dealer_state == "short_gamma":
        notes.append("Dealers net short gamma — moves get amplified.")

    if gex.gamma_flip is not None:
        if spot > gex.gamma_flip:
            score += 8
            notes.append(f"Price above gamma flip {gex.gamma_flip:.2f} — supportive.")
        else:
            score -= 8
            notes.append(f"Price below gamma flip {gex.gamma_flip:.2f} — fragile.")

    # Flow sentiment is the strongest short-horizon signal
    score += flow_sentiment_score * 0.6

    # IV regime
    iv_state = iv.state
    if iv_state == "expansion":
        notes.append("Vol term-structure inverted — volatility expansion regime.")
        score -= 5  # vol expansion usually correlates with downside in equities
    elif iv_state == "compression":
        notes.append("Vol curve in contango / compressed — drift higher favored.")
        score += 4
    elif iv_state == "crush":
        notes.append("Realized vol exceeds implied — potential IV crush setup.")

    if iv.skew_25d is not None and iv.skew_25d > 0.05:
        notes.append("Put skew elevated — protection bid.")
        score -= 3

    if vix is not None:
        if vix >= 25:
            notes.append(f"VIX {vix:.1f} — defensive posture.")
            score -= 6
        elif vix < 14:
            notes.append(f"VIX {vix:.1f} — complacency / drift risk.")
            score += 3

    # Cap to [-100, 100]
    score = max(-100.0, min(100.0, score))

    # Regime label uses both score and dealer/vol state
    regime = _bias_for(score)
    if iv_state == "expansion":
        regime = "Volatility Expansion"
    elif iv_state == "compression":
        regime = "Volatility Compression"
    if gex.dealer_state == "long_gamma" and abs(score) < 15:
        regime = "Dealer Long Gamma"
    elif gex.dealer_state == "short_gamma" and abs(score) < 15:
        regime = "Dealer Short Gamma"

    confidence = float(min(1.0, 0.4 + abs(score) / 120.0))
    intraday_bias = _bias_for(score * 0.8 + flow_sentiment_score * 0.2)
    daily_bias = _bias_for(score)
    weekly_bias = _bias_for(score * 0.5)

    expected_1d = _expected_move(spot, iv.atm_iv, 1)
    expected_1w = _expected_move(spot, iv.atm_iv, 7)

    squeeze = _gamma_squeeze_risk(gex)
    mr = _mean_reversion_score(gex)
    trend = _trend_continuation_score(gex, flow_sentiment_score)

    return RegimeClassification(
        underlying=gex.underlying,
        timestamp=now,
        regime=regime,
        confidence=confidence,
        intraday_bias=intraday_bias,
        daily_bias=daily_bias,
        weekly_bias=weekly_bias,
        volatility_state=iv_state,
        expected_move_1d=expected_1d,
        expected_move_1w=expected_1w,
        sentiment_score=score,
        gamma_squeeze_risk=squeeze,
        mean_reversion_score=mr,
        trend_continuation_score=trend,
        notes=notes,
    )
