"""Rule-based market regime classifier.

Signals used (all computable from free/delayed chain + macro data):
    1. Dealer gamma posture   — GEX sign, magnitude, distance to flip
    2. Higher-order exposures — Vanna, Charm, DEX direction
    3. Volatility state       — IV compression/expansion, skew, HV vs IV
    4. Flow sentiment         — type-weighted bull/bear premium score
                                (UNUSUAL 2×, SWEEP 1.5×, LARGE 1×, BLOCK 0.8×)
    5. Put/Call ratios        — OI and volume PCR
    6. Max pain distance      — spot vs max pain creates expiry gravity
    7. 0DTE proportion        — fraction of flow expiring today signals intraday regime
    8. Cross-asset context    — VIX level, VVIX (vol-of-vol)

Outputs:
    - Regime label (Strong Bullish … Strong Bearish + vol/gamma overlays)
    - Three time-horizon biases (intraday / daily / weekly)
    - Composite sub-scores: dealer_pressure (0-100), vol_expansion (0-100),
      flow_aggression (0-100) — all rules-based, same input → same output
    - Risk scores: gamma_squeeze, mean_reversion, trend_continuation
    - Expected move (1D and 1W from ATM IV)
    - Narrative notes list
"""
from __future__ import annotations

import math
from datetime import UTC, datetime

from app.analytics.flow import zero_dte_premium_ratio
from app.schemas import (
    FlowEvent,
    FlowMetrics,
    GEXProfile,
    IVSummary,
    RegimeClassification,
)


# ─── Label helpers ────────────────────────────────────────────────────────────

def _bias_for(score: float) -> str:
    """Map -100..100 composite score → discrete bias label."""
    if score >= 60:  return "Strong Bullish"
    if score >= 25:  return "Bullish"
    if score >= 10:  return "Bullish Chop"
    if score > -10:  return "Neutral Chop"
    if score > -25:  return "Bearish Chop"
    if score > -60:  return "Bearish"
    return "Strong Bearish"


# ─── Sub-score computations (0–100, rules-based) ──────────────────────────────

def _dealer_pressure_score(gex: GEXProfile) -> float:
    """0–100.  >50 = net bullish dealer pressure,  <50 = bearish,  50 = neutral.

    Driven by:
      · GEX sign + magnitude  (long-gamma = price-suppressing but stable bias)
      · Distance of spot from gamma flip  (above = bullish, below = bearish)
      · Vanna direction  (positive vanna → as IV falls dealers buy delta)
      · DEX sign  (net dollar delta exposure)
      · Charm direction  (positive charm → dealer delta builds with time)
    """
    score = 50.0
    spot = gex.underlying_price

    if gex.dealer_state == "long_gamma":
        score += 8
    elif gex.dealer_state == "short_gamma":
        score -= 3

    if gex.gamma_flip and spot > 0:
        pct = (spot - gex.gamma_flip) / spot
        score += max(-20.0, min(20.0, pct * 300))

    if gex.total_gex != 0:
        mag = min(8.0, abs(gex.total_gex) / 1e9)
        score += mag if gex.total_gex > 0 else -mag

    if gex.total_vanna != 0:
        v_sig = min(6.0, abs(gex.total_vanna) / 1e8)
        score += v_sig if gex.total_vanna > 0 else -v_sig

    if gex.total_dex != 0:
        d_sig = min(6.0, abs(gex.total_dex) / 1e9)
        score += d_sig if gex.total_dex > 0 else -d_sig

    if gex.total_charm != 0:
        c_sig = min(4.0, abs(gex.total_charm) / 1e7)
        score += c_sig if gex.total_charm > 0 else -c_sig

    return max(0.0, min(100.0, score))


def _vol_expansion_score(
    iv: IVSummary,
    vix: float | None,
    vvix: float | None,
    dte0_ratio: float = 0.0,
) -> float:
    """0–100.  High = vol expanding / fearful.  Low = compressed / calm.

    dte0_ratio: fraction of flow premium expiring today.
    High 0DTE proportion increases intraday vol expansion risk.
    """
    base = {"expansion": 65.0, "crush": 40.0, "normal": 35.0, "compression": 20.0}
    score = base.get(iv.state, 35.0)

    if iv.iv_rank is not None:
        score += iv.iv_rank * 0.20

    if iv.skew_25d is not None:
        if iv.skew_25d > 0.08:    score += 12
        elif iv.skew_25d > 0.04:  score += 6
        elif iv.skew_25d < -0.02: score -= 4

    if iv.atm_iv and iv.realized_vol_20d and iv.realized_vol_20d > 0:
        ratio = iv.atm_iv / iv.realized_vol_20d
        if ratio > 1.4:   score += 8
        elif ratio < 0.7: score -= 8

    if vix is not None:
        if vix >= 30:    score += 18
        elif vix >= 22:  score += 10
        elif vix >= 17:  score += 4
        elif vix < 12:   score -= 8

    if vvix is not None:
        if vvix >= 130:   score += 12
        elif vvix >= 110: score += 6
        elif vvix < 85:   score -= 6

    # 0DTE flow dominance amplifies intraday vol expansion risk
    if dte0_ratio > 0.6:
        score += 12
    elif dte0_ratio > 0.4:
        score += 6
    elif dte0_ratio > 0.25:
        score += 3

    return max(0.0, min(100.0, score))


def _flow_aggression_score(
    flow_sentiment: float,
    flow_metrics: FlowMetrics | None,
) -> float:
    """0–100.  High = strong directional premium aggression.  Low = balanced/quiet."""
    score = abs(flow_sentiment)

    if flow_metrics is not None:
        pcr_vol = flow_metrics.pcr_vol
        if pcr_vol is not None:
            if pcr_vol < 0.55 or pcr_vol > 1.65:
                score = min(100.0, score + 18)
            elif 0.85 <= pcr_vol <= 1.15:
                score = max(0.0, score - 12)

        pcr_oi = flow_metrics.pcr_oi
        if pcr_oi is not None:
            if pcr_oi < 0.60 or pcr_oi > 1.55:
                score = min(100.0, score + 10)

    return max(0.0, min(100.0, score))


# ─── Risk scores ──────────────────────────────────────────────────────────────

def _gamma_squeeze_risk(gex: GEXProfile) -> float:
    if gex.total_gex >= 0:
        return 0.1
    if gex.largest_call_wall is None or gex.underlying_price <= 0:
        return 0.3
    dist_pct = (gex.largest_call_wall - gex.underlying_price) / gex.underlying_price
    if dist_pct < 0:
        return 0.4
    proximity = max(0.0, 1.0 - dist_pct / 0.02)
    magnitude = min(1.0, abs(gex.total_gex) / 5e9)
    return float(min(1.0, 0.3 + 0.4 * proximity + 0.3 * magnitude))


def _mean_reversion_score(gex: GEXProfile) -> float:
    if gex.total_gex <= 0:
        return 0.2
    magnitude = min(1.0, gex.total_gex / 5e9)
    return float(0.4 + 0.6 * magnitude)


def _trend_continuation_score(gex: GEXProfile, flow_sent: float) -> float:
    if gex.total_gex >= 0:
        base = 0.3
    else:
        base = 0.6 + min(0.3, abs(flow_sent) / 100.0)
    return float(min(1.0, base))


def _expected_move(spot: float, atm_iv: float | None, days: int) -> float | None:
    if atm_iv is None or spot <= 0 or atm_iv <= 0:
        return None
    return float(spot * atm_iv * math.sqrt(days / 365.0))


# ─── Main classifier ──────────────────────────────────────────────────────────

def classify(
    *,
    gex: GEXProfile,
    iv: IVSummary,
    flow_events: list[FlowEvent],
    vix: float | None = None,
    vvix: float | None = None,
    flow_sentiment_score: float = 0.0,
    flow_metrics: FlowMetrics | None = None,
    now: datetime | None = None,
) -> RegimeClassification:
    """Combine all signals into a regime classification."""
    now = now or datetime.now(UTC)
    spot = gex.underlying_price

    score = 0.0
    notes: list[str] = []

    # ── Dealer gamma state ─────────────────────────────────────────────────
    if gex.dealer_state == "long_gamma":
        score += 5
        notes.append("Dealers net long gamma — mean-reversion environment, moves get dampened.")
    elif gex.dealer_state == "short_gamma":
        notes.append("Dealers net short gamma — moves get amplified in either direction.")

    if gex.gamma_flip is not None:
        if spot > gex.gamma_flip:
            score += 8
            notes.append(f"Price above gamma flip {gex.gamma_flip:.2f} — dealer hedging supportive.")
        else:
            score -= 8
            notes.append(f"Price below gamma flip {gex.gamma_flip:.2f} — dealer flow fragile.")

    # ── Higher-order exposures ─────────────────────────────────────────────
    if gex.total_vanna != 0:
        v_mag = abs(gex.total_vanna)
        if v_mag > 5e7:
            if gex.total_vanna > 0:
                score += 4
                notes.append(
                    f"Positive vanna exposure ${v_mag/1e6:.0f}M — "
                    "as IV falls, dealers buy delta (bullish feedback)."
                )
            else:
                score -= 4
                notes.append(
                    f"Negative vanna exposure ${v_mag/1e6:.0f}M — "
                    "as IV rises, dealers sell delta (bearish feedback)."
                )

    if gex.total_charm != 0 and abs(gex.total_charm) > 1e6:
        if gex.total_charm > 0:
            score += 2
            notes.append("Positive charm — dealer delta builds with time, subtle upward drift bias.")
        else:
            score -= 2
            notes.append("Negative charm — dealer delta erodes with time, subtle headwind.")

    if gex.total_dex != 0:
        dex_b = gex.total_dex / 1e9
        if abs(dex_b) > 0.5:
            direction = "long" if dex_b > 0 else "short"
            score += 3 if dex_b > 0 else -3
            notes.append(f"Net DEX ${dex_b:.1f}B — dealers net {direction} delta.")

    # ── Flow sentiment (type-weighted: UNUSUAL 2×, SWEEP 1.5×, BLOCK 0.8×) ──
    score += flow_sentiment_score * 0.6

    # ── Put/Call ratios ────────────────────────────────────────────────────
    if flow_metrics is not None and flow_metrics.pcr_oi is not None:
        pcr = flow_metrics.pcr_oi
        if pcr < 0.6:
            score += 8
            notes.append(f"PCR OI {pcr:.2f} — extreme call bias, speculative bullish positioning.")
        elif pcr < 0.8:
            score += 4
            notes.append(f"PCR OI {pcr:.2f} — call-heavy; market leaning bullish.")
        elif pcr > 1.5:
            score -= 8
            notes.append(f"PCR OI {pcr:.2f} — heavy put protection; defensive posture.")
        elif pcr > 1.2:
            score -= 4
            notes.append(f"PCR OI {pcr:.2f} — elevated put OI; modest bearish lean.")

    # ── Max pain distance — expiry gravity ────────────────────────────────
    # Max pain acts as a gravitational attractor near expiry.
    # Above max pain → market makers profit from price falling → downside gravity.
    # Below max pain → market makers profit from price rising → upside gravity.
    if flow_metrics is not None and flow_metrics.max_pain is not None and spot > 0:
        mp = flow_metrics.max_pain
        dist_pct = (spot - mp) / spot * 100  # + = spot above pain, – = spot below

        if abs(dist_pct) < 0.3:
            # Pinned right on max pain — classic expiry pin
            notes.append(
                f"Spot within 0.3% of max pain {mp:.0f} — strong expiry pin risk, "
                "expect rangebound action near this level."
            )
        elif dist_pct > 3.0:
            # Well above max pain — gravity pulling down
            pull = min(8.0, dist_pct * 1.5)
            score -= pull
            notes.append(
                f"Spot {dist_pct:.1f}% above max pain {mp:.0f} — "
                "downside gravity near expiry as market makers benefit from price falling."
            )
        elif dist_pct > 1.0:
            pull = min(4.0, dist_pct * 1.2)
            score -= pull
            notes.append(
                f"Spot {dist_pct:.1f}% above max pain {mp:.0f} — mild gravitational pull lower."
            )
        elif dist_pct < -3.0:
            # Well below max pain — gravity pulling up
            pull = min(8.0, abs(dist_pct) * 1.5)
            score += pull
            notes.append(
                f"Spot {abs(dist_pct):.1f}% below max pain {mp:.0f} — "
                "upside gravity near expiry as market makers benefit from price rising."
            )
        elif dist_pct < -1.0:
            pull = min(4.0, abs(dist_pct) * 1.2)
            score += pull
            notes.append(
                f"Spot {abs(dist_pct):.1f}% below max pain {mp:.0f} — mild gravitational pull higher."
            )

    # ── 0DTE proportion ────────────────────────────────────────────────────
    # High 0DTE flow = gamma-driven intraday speculation dominates.
    # Reduces multi-day predictability; raises intraday vol risk.
    today = now.date()
    dte0_ratio = zero_dte_premium_ratio(flow_events, today)

    if dte0_ratio > 0.6:
        notes.append(
            f"0DTE dominates flow ({dte0_ratio*100:.0f}% of premium) — "
            "intraday moves may be explosive and binary; multi-day bias less reliable."
        )
    elif dte0_ratio > 0.4:
        notes.append(
            f"Elevated 0DTE flow ({dte0_ratio*100:.0f}% of premium) — "
            "gamma-driven intraday volatility elevated."
        )
    elif dte0_ratio > 0.25:
        notes.append(
            f"Moderate 0DTE flow ({dte0_ratio*100:.0f}% of premium) — "
            "watch for sharp intraday moves around key strikes."
        )

    # ── IV regime ──────────────────────────────────────────────────────────
    iv_state = iv.state
    if iv_state == "expansion":
        score -= 5
        notes.append("Vol term-structure inverted — volatility expansion regime, downside bias.")
    elif iv_state == "compression":
        score += 4
        notes.append("Vol in contango / compressed — drift-higher environment favored.")
    elif iv_state == "crush":
        notes.append("Realized vol > implied — potential IV crush setup.")

    if iv.skew_25d is not None and iv.skew_25d > 0.05:
        score -= 3
        notes.append(f"25d put skew {iv.skew_25d:.3f} — protection bid elevated.")

    if iv.atm_iv and iv.realized_vol_20d and iv.realized_vol_20d > 0:
        ratio = iv.atm_iv / iv.realized_vol_20d
        if ratio > 1.4:
            notes.append(f"IV/RV ratio {ratio:.2f} — vol rich, potential for crush.")
        elif ratio < 0.75:
            score -= 2
            notes.append(f"IV/RV ratio {ratio:.2f} — vol cheap, expansion risk present.")

    # ── VIX ────────────────────────────────────────────────────────────────
    if vix is not None:
        if vix >= 30:
            score -= 8
            notes.append(f"VIX {vix:.1f} — fear elevated, defensive posture warranted.")
        elif vix >= 22:
            score -= 4
            notes.append(f"VIX {vix:.1f} — vol elevated, cautious environment.")
        elif vix < 12:
            score += 3
            notes.append(f"VIX {vix:.1f} — extreme complacency, drift risk.")
        elif vix < 16:
            score += 2
            notes.append(f"VIX {vix:.1f} — calm vol environment, supportive.")

    # ── VVIX (vol-of-vol) ──────────────────────────────────────────────────
    if vvix is not None:
        if vvix >= 130:
            score -= 5
            notes.append(f"VVIX {vvix:.0f} — vol-of-vol spiking, unstable volatility regime.")
        elif vvix >= 110:
            score -= 2
            notes.append(f"VVIX {vvix:.0f} — vol-of-vol elevated, watch for vol regime shift.")
        elif vvix < 85:
            score += 3
            notes.append(f"VVIX {vvix:.0f} — vol-of-vol calm, stable vol environment.")

    # ── Cap and derive outputs ─────────────────────────────────────────────
    score = max(-100.0, min(100.0, score))

    regime = _bias_for(score)
    # Override with structural regimes only when score is truly near-zero
    # (abs < 8) so directional signals always win over structural labels.
    if iv_state == "expansion":
        regime = "Volatility Expansion"
    elif iv_state == "compression":
        regime = "Volatility Compression"
    if gex.dealer_state == "long_gamma" and abs(score) < 8:
        regime = "Dealer Long Gamma"
    elif gex.dealer_state == "short_gamma" and abs(score) < 8:
        regime = "Dealer Short Gamma"

    squeeze_risk = _gamma_squeeze_risk(gex)
    if squeeze_risk > 0.7:
        regime = "Gamma Squeeze Risk"
        notes.append("High gamma squeeze risk — dealers short gamma with call wall nearby.")

    # Confidence: base + score magnitude, reduced when 0DTE dominates
    confidence = float(min(1.0, 0.4 + abs(score) / 120.0))
    if dte0_ratio > 0.6:
        confidence = max(0.25, confidence - 0.12)
    elif dte0_ratio > 0.4:
        confidence = max(0.30, confidence - 0.06)

    # ── Intraday bias — GEX + flow driven (short-term gamma/flow signals) ──
    # Reflects what dealers will do in the NEXT few hours.
    intraday_raw = 0.0
    if gex.dealer_state == "long_gamma":
        intraday_raw += 8   # dampening environment, slight mean-reversion bias
    elif gex.dealer_state == "short_gamma":
        intraday_raw -= 12  # amplification, directional follow-through
    if gex.gamma_flip is not None and spot > 0:
        flip_pct = (spot - gex.gamma_flip) / spot * 100
        intraday_raw += max(-18.0, min(18.0, flip_pct * 6))
    intraday_raw += flow_sentiment_score * 0.6  # flow is the primary intraday signal
    if dte0_ratio > 0.4:
        intraday_raw *= 0.7   # high 0DTE = unpredictable, dampen conviction
    intraday_bias = _bias_for(max(-100.0, min(100.0, intraday_raw)))

    # ── Daily bias — the main composite score ──────────────────────────────
    daily_bias = _bias_for(score)

    # ── Weekly bias — structural signals (PCR, vanna/charm, macro) ─────────
    # Deweights 0DTE noise, focuses on persistent positioning.
    weekly_raw = 0.0
    if flow_metrics is not None and flow_metrics.pcr_oi is not None:
        pcr = flow_metrics.pcr_oi
        if pcr > 1.8:    weekly_raw -= 20
        elif pcr > 1.5:  weekly_raw -= 12
        elif pcr > 1.2:  weekly_raw -= 6
        elif pcr < 0.6:  weekly_raw += 15
        elif pcr < 0.8:  weekly_raw += 8
    if gex.total_vanna != 0:
        v_sig = min(12.0, abs(gex.total_vanna) / 5e8)
        weekly_raw += v_sig if gex.total_vanna > 0 else -v_sig
    if gex.total_charm != 0:
        c_sig = min(6.0, abs(gex.total_charm) / 1e7)
        weekly_raw += c_sig if gex.total_charm > 0 else -c_sig
    if gex.dealer_state == "long_gamma":
        weekly_raw += 5
    elif gex.dealer_state == "short_gamma":
        weekly_raw -= 8
    weekly_raw += flow_sentiment_score * 0.25  # flow matters less week-over-week
    if vix is not None:
        if vix >= 25:   weekly_raw -= 15
        elif vix >= 20: weekly_raw -= 8
        elif vix < 14:  weekly_raw += 6
    if iv_state == "expansion":
        weekly_raw -= 8
    elif iv_state == "compression":
        weekly_raw += 6
    weekly_bias = _bias_for(max(-100.0, min(100.0, weekly_raw)))

    # Sub-scores
    dealer_score = _dealer_pressure_score(gex)
    vol_score    = _vol_expansion_score(iv, vix, vvix, dte0_ratio)
    flow_agg     = _flow_aggression_score(flow_sentiment_score, flow_metrics)

    return RegimeClassification(
        underlying=gex.underlying,
        timestamp=now,
        regime=regime,
        confidence=confidence,
        intraday_bias=intraday_bias,
        daily_bias=daily_bias,
        weekly_bias=weekly_bias,
        volatility_state=iv_state,
        expected_move_1d=_expected_move(spot, iv.atm_iv, 1),
        expected_move_1w=_expected_move(spot, iv.atm_iv, 7),
        sentiment_score=score,
        gamma_squeeze_risk=squeeze_risk,
        mean_reversion_score=_mean_reversion_score(gex),
        trend_continuation_score=_trend_continuation_score(gex, flow_sentiment_score),
        notes=notes,
        dealer_pressure_score=dealer_score,
        vol_expansion_score=vol_score,
        flow_aggression_score=flow_agg,
        total_vanna=gex.total_vanna,
        total_charm=gex.total_charm,
        total_dex=gex.total_dex,
        total_vex=gex.total_vex,
        vvix=vvix,
    )
