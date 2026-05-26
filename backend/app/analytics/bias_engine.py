"""
Conditional options-flow bias engine.

Design
------
* GEX is the MASTER REGIME variable — it is NOT directional.  It sets the
  damping / amplifying environment for all directional signals.
* Directional signals: DEX, vanna (× IV direction), charm (× time), skew,
  term structure, PCR, gamma walls.
* Gamma amplifier:
      amplifier = 1 + k × (−γ_regime)
  · Short gamma (γ_regime < 0)  →  amplifier > 1  →  directional moves amplify
  · Long gamma  (γ_regime > 0)  →  amplifier < 1  →  moves dampen / mean-revert
* Four DTE buckets produce four independent timeframe views:
      Intraday  0– 2 DTE   (0dte / pin risk)
      Daily     3– 9 DTE   (front week)
      Weekly   10–35 DTE   (monthly expiries)
      Monthly  36–90 DTE   (back-month positioning)
* Special gates override the final label:
      Vol Expansion : iv_rank > 70 + term backwardation + short gamma
      Range-Bound   : near max pain + long gamma + between walls + DTE ≤ 2
* All output values are native Python float (never np.float64).
"""
from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any

from app.schemas import (
    BiasOutput,
    BiasSubScore,
    BiasTimeframe,
    ChainSnapshot,
    ContractRow,
    FlowMetrics,
    GEXProfile,
    IVSummary,
)

# ──────────────────────────────────────────────────────────────────────────────
#  CONFIG
# ──────────────────────────────────────────────────────────────────────────────

_CFG: dict[str, Any] = {
    # Gaussian strike-band width: α = 8 % of spot
    # weight = exp(−½·((K−S)/(α·S))²)
    # →  weight ≈ 0.61 at ±8 %,  ≈ 0.14 at ±16 %
    "alpha": 0.08,

    # Gamma amplifier coefficient k
    # amplifier = 1 + k × (−γ_regime)  →  range [0.5, 1.5] for k = 0.5
    "k": 0.50,

    # tanh squash: final_bias = 100 × tanh(biased × scale)
    # directional_raw is a weighted avg of sub-scores each ∈ [-1,1], so biased ∈ [-1.5, 1.5].
    # scale = 1.0  →  biased ±1.5 → bias ±90;  biased ±0.5 → bias ±46
    "tanh_scale": 1.0,

    # DTE half-open bucket boundaries [lo, hi)
    "buckets": {
        "intraday": (0,  3),
        "daily":    (3,  10),
        "weekly":   (10, 36),
        "monthly":  (36, 91),
    },

    # Signal weights per timeframe (un-normalised; engine normalises internally).
    # Each timeframe intentionally uses a different mix to reflect the signals
    # that are meaningful at that horizon.
    "weights": {
        "intraday": {
            "dex":   0.30,
            "charm": 0.30,
            "skew":  0.15,
            "pcr":   0.15,
            "walls": 0.10,
        },
        "daily": {
            "dex":   0.25,
            "vanna": 0.20,
            "charm": 0.15,
            "skew":  0.15,
            "pcr":   0.15,
            "walls": 0.10,
        },
        "weekly": {
            "dex":   0.20,
            "vanna": 0.25,
            "skew":  0.20,
            "pcr":   0.20,
            "term":  0.15,
        },
        "monthly": {
            "dex":   0.15,
            "vanna": 0.25,
            "skew":  0.25,
            "term":  0.20,
            "pcr":   0.15,
        },
    },

    # Exposure normalisers for tanh mapping (calibrated for TOTAL Gaussian-weighted sums,
    # not per-contract averages):
    #   SPY/QQQ ATM DEX per strike ≈ $50–200 M; ~30 effective near-money strikes
    #   → total w_dex ≈ $500 M–2 B  →  norm $1 B is sensible
    "dex_norm":   1_000_000_000.0,  # $1 B total Gaussian-weighted DEX
    "vanna_norm":    50_000_000.0,  # $50 M total Gaussian-weighted vanna
    "charm_norm":       500_000.0,  # $500 K total Gaussian-weighted time-weighted charm

    # GEX normaliser for γ_regime tanh: $200 M
    "gex_norm": 200_000_000.0,

    # Vol-gate thresholds
    "vol_gate_ivr_min": 70.0,   # iv_rank > 70
    "vol_gate_gex_max": 0.0,    # total_gex < 0  (short gamma)

    # Pin-gate thresholds
    "pin_gex_min":   0.0,       # total_gex > 0  (long gamma)
    "pin_pain_band": 0.005,     # within 0.5 % of max pain
    "pin_bias_mult": 0.25,      # dampen final bias by 75 %

    # Minimum contracts in a bucket to produce a real score
    "min_contracts": 10,
}

# Canonical ordering of sub-score keys
_ALL_SCORES: tuple[str, ...] = ("dex", "vanna", "charm", "skew", "pcr", "walls", "term")

# Standard tenor ordering for term-structure reads
_TENOR_ORDER = ("0dte", "1w", "2w", "1m", "2m", "3m", "6m", "1y+")


# ──────────────────────────────────────────────────────────────────────────────
#  LOW-LEVEL HELPERS
# ──────────────────────────────────────────────────────────────────────────────

def _sf(x: Any) -> float:
    """Safe-cast to native Python float; return 0.0 for None / non-finite."""
    try:
        v = float(x)
        return v if math.isfinite(v) else 0.0
    except (TypeError, ValueError):
        return 0.0


def _clamp(x: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _gw(strike: float, spot: float) -> float:
    """Gaussian distance weight for a strike relative to spot."""
    z = (strike - spot) / (_CFG["alpha"] * spot)
    return math.exp(-0.5 * z * z)


def _sub(score: float, conf: float) -> BiasSubScore:
    """Construct a BiasSubScore with clamped values and an auto label."""
    score = _clamp(_sf(score))
    conf  = _clamp(_sf(conf), 0.0, 1.0)
    if   score >  0.50: label = "Bullish"
    elif score >  0.15: label = "Mild Bullish"
    elif score > -0.15: label = "Neutral"
    elif score > -0.50: label = "Mild Bearish"
    else:               label = "Bearish"
    return BiasSubScore(score=score, confidence=conf, label=label)


def _neutral_sub() -> BiasSubScore:
    return BiasSubScore(score=0.0, confidence=0.0, label="Neutral")


def _empty_subs() -> dict[str, BiasSubScore]:
    return {k: _neutral_sub() for k in _ALL_SCORES}


def _dte_of(row: ContractRow, now_utc: datetime) -> int:
    """Calendar DTE for a contract row; minimum 0."""
    exp = row.contract.expiration
    exp_dt = datetime(exp.year, exp.month, exp.day, 16, 0, tzinfo=UTC)
    days = (exp_dt - now_utc).total_seconds() / 86_400.0
    return max(0, int(days))


def _regime_label(bias: float, gate: str | None) -> str:
    """Map a ±100 bias value + optional gate to a 9-label regime string."""
    if gate == "vol_expansion":
        return "Volatility Expansion"
    if gate == "pinned":
        return "Range-Bound / Pinned"
    if   bias >  65: return "Strong Bullish"
    elif bias >  35: return "Bullish"
    elif bias >  12: return "Mild Bullish"
    elif bias > -12: return "Neutral"
    elif bias > -35: return "Mild Bearish"
    elif bias > -65: return "Bearish"
    else:            return "Strong Bearish"


def _empty_timeframe(reason: str = "insufficient data") -> BiasTimeframe:
    """Neutral placeholder BiasTimeframe when data is insufficient."""
    return BiasTimeframe(
        bias=0.0,
        confidence=0.0,
        label="Neutral",
        gate=None,
        contract_count=0,
        sub_scores=_empty_subs(),
    )


# ──────────────────────────────────────────────────────────────────────────────
#  IV DIRECTION (used by vanna sub-score)
# ──────────────────────────────────────────────────────────────────────────────

def _iv_direction(iv_summary: IVSummary | None) -> float:
    """
    Estimate whether IV is likely to rise or fall, as a float in [−1, +1].

    Uses iv_rank as a proxy:
      · High iv_rank (→ 100) : IV elevated → likely to mean-revert down → −1
      · Low  iv_rank (→   0) : IV compressed → likely to expand          → +1
      · Mid  iv_rank (≈  50) : no clear directional signal               →  0

    Mapping: direction = −tanh((iv_rank − 50) / 25)
    """
    if iv_summary is None or iv_summary.iv_rank is None:
        return 0.0
    ivr = _sf(iv_summary.iv_rank)
    return float(math.tanh(-(ivr - 50.0) / 25.0))


# ──────────────────────────────────────────────────────────────────────────────
#  TERM-STRUCTURE HELPERS
# ──────────────────────────────────────────────────────────────────────────────

def _ts_front_back(iv_summary: IVSummary | None) -> tuple[float, float] | None:
    """Return (front_iv, back_iv) from the term structure, or None."""
    if iv_summary is None:
        return None
    ts = iv_summary.term_structure
    avail = [t for t in _TENOR_ORDER if t in ts and ts[t] > 0]
    if len(avail) < 2:
        return None
    return _sf(ts[avail[0]]), _sf(ts[avail[-1]])


def _is_term_inverted(iv_summary: IVSummary | None) -> bool:
    """True if front IV > back IV by more than 5 %."""
    fb = _ts_front_back(iv_summary)
    if fb is None:
        return False
    front, back = fb
    return back > 1e-4 and front > back * 1.05


# ──────────────────────────────────────────────────────────────────────────────
#  SUB-SCORE FUNCTIONS
# ──────────────────────────────────────────────────────────────────────────────

def _score_dex(w_dex_total: float) -> BiasSubScore:
    """
    Total Gaussian-weighted DEX directional score.

    w_dex_total = Σ gw(K) × DEX(K) over all contracts in the DTE bucket.
    DEX > 0 means dealers carry net long delta (call-dominated exposure),
    arising from more retail call buying → bullish underlying activity.
    DEX < 0 → put-dominated → bearish.
    """
    if w_dex_total == 0.0:
        return _neutral_sub()
    score = float(math.tanh(w_dex_total / _CFG["dex_norm"]))
    conf  = min(1.0, abs(w_dex_total) / _CFG["dex_norm"])
    return _sub(score, conf)


def _score_vanna(w_vanna_total: float, iv_dir: float) -> BiasSubScore:
    """
    Total Gaussian-weighted vanna score, conditional on IV direction.

    Vanna = ∂Δ/∂σ.  When IV moves, dealers with positive vanna must rebalance:
      · net_vanna > 0 and IV rising  →  dealers buy  delta  →  bullish
      · net_vanna > 0 and IV falling →  dealers sell delta  →  bearish
    Formula: score = sign(net_vanna) × iv_direction
    Vanna only creates flow pressure when IV is actually moving (|iv_dir| > 0.05).
    """
    if w_vanna_total == 0.0 or abs(iv_dir) < 0.05:
        return _neutral_sub()
    raw_score = math.tanh(w_vanna_total / _CFG["vanna_norm"]) * iv_dir
    conf      = min(1.0, abs(w_vanna_total) / _CFG["vanna_norm"])
    return _sub(float(raw_score), conf)


def _score_charm(w_charm_tw_total: float) -> BiasSubScore:
    """
    Total Gaussian-weighted, time-weighted charm score.

    Charm = ∂Δ/∂t.  Positive charm → dealer delta drifts higher over time → bullish.
    The 1/√DTE time weighting means near-expiry contracts dominate for intraday/daily.
    w_charm_tw_total = Σ gw(K) × (1/√DTE) × charm_exposure(K).
    """
    if w_charm_tw_total == 0.0:
        return _neutral_sub()
    score = float(math.tanh(w_charm_tw_total / _CFG["charm_norm"]))
    conf  = min(1.0, abs(w_charm_tw_total) / _CFG["charm_norm"])
    return _sub(score, conf)


def _score_skew(iv_summary: IVSummary | None) -> BiasSubScore:
    """
    25-delta put/call skew score.

    skew_25d = put_iv − call_iv.  Positive skew = put wing expensive = fear/bearish.
    score = −tanh(skew_25d / 0.05)   (5 vol-point skew → strong signal)
    """
    if iv_summary is None or iv_summary.skew_25d is None:
        return _neutral_sub()
    skew = _sf(iv_summary.skew_25d)
    score = float(math.tanh(-skew / 0.05))
    conf  = min(1.0, abs(skew) / 0.10)
    return _sub(score, conf)


def _score_term(iv_summary: IVSummary | None) -> BiasSubScore:
    """
    Term-structure slope score.

    Contango   (back > front IV): normal, low-vol environment → bullish.
    Backwardation (front > back): fear / vol expansion → bearish.
    score = tanh(slope / 0.15)  where slope = (back−front) / back
    """
    fb = _ts_front_back(iv_summary)
    if fb is None:
        return _neutral_sub()
    front, back = fb
    if back < 1e-4:
        return _neutral_sub()
    slope = (back - front) / back      # positive = contango, negative = backwardation
    score = float(math.tanh(slope / 0.15))
    conf  = min(1.0, abs(slope) / 0.10)
    return _sub(score, conf)


def _score_pcr(
    pcr_oi: float | None,
    pcr_history: list[float] | None,
) -> BiasSubScore:
    """
    Put/call ratio score.

    High PCR (many puts vs calls) → bearish; low PCR → bullish.
    Uses z-score against rolling history when available; otherwise simple
    threshold mapping anchored at PCR = 1.0 (neutral).

    score = tanh(−z × 0.7)
    """
    if pcr_oi is None:
        return _neutral_sub()
    pcr = _sf(pcr_oi)
    if pcr <= 0:
        return _neutral_sub()

    if pcr_history and len(pcr_history) >= 5:
        mean = sum(pcr_history) / len(pcr_history)
        var  = sum((x - mean) ** 2 for x in pcr_history) / len(pcr_history)
        std  = math.sqrt(var)
        z    = (pcr - mean) / std if std > 1e-9 else 0.0
        score = float(math.tanh(-z * 0.7))
        conf  = min(1.0, abs(z) / 2.0)
    else:
        # Threshold: PCR 1.0 = neutral centre; ±0.4 = one "unit"
        z     = (pcr - 1.0) / 0.4
        score = float(math.tanh(-z * 0.7))
        conf  = min(1.0, abs(pcr - 1.0) / 0.5)

    return _sub(score, conf)


def _score_walls(
    spot: float,
    call_wall: float | None,
    put_wall: float | None,
) -> BiasSubScore:
    """
    Price relative to gamma walls.

    · Spot below put wall  →  bearish (market has breached put support)
    · Spot above call wall →  bearish (price pushing into heavy resistance)
    · Between walls        →  mild directional lean based on proximity
    """
    if call_wall is None and put_wall is None:
        return _neutral_sub()

    if put_wall is not None and spot < put_wall:
        pct   = (put_wall - spot) / spot
        score = -_clamp(float(math.tanh(pct / 0.03)))
        conf  = min(1.0, pct / 0.05)
        return _sub(score, conf)

    if call_wall is not None and spot > call_wall:
        pct   = (spot - call_wall) / spot
        score = -_clamp(float(math.tanh(pct / 0.03)))
        conf  = min(1.0, pct / 0.05)
        return _sub(score, conf)

    # Between walls: mild lean based on fractional position in the range
    if call_wall is not None and put_wall is not None:
        rng = call_wall - put_wall
        if rng > 0:
            pos   = (spot - put_wall) / rng      # 0 = at put wall, 1 = at call wall
            score = (pos - 0.5) * 0.40           # −0.2 … +0.2
            conf  = 0.25
            return _sub(score, conf)

    return _neutral_sub()


# ──────────────────────────────────────────────────────────────────────────────
#  PER-TIMEFRAME SCORING
# ──────────────────────────────────────────────────────────────────────────────

def _score_timeframe(
    tf_name: str,
    rows: list[ContractRow],
    spot: float,
    now_utc: datetime,
    gex_profile: GEXProfile,
    iv_summary: IVSummary | None,
    flow_metrics: FlowMetrics | None,
    gamma_regime: float,
    pcr_history: list[float] | None,
) -> BiasTimeframe:
    """
    Score one DTE-bucket slice of the chain.

    Steps
    -----
    A. Gaussian-weight each contract by strike distance from spot.
    B. Aggregate weighted exposures (DEX, vanna, time-weighted charm).
    C. Compute individual sub-scores.
    D. Weighted combination → directional_raw ∈ [−1, +1].
    E. Apply gamma amplifier → biased.
    F. Check vol-gate and pin-gate.
    G. tanh squash → final bias ∈ [−100, +100].
    """
    if len(rows) < _CFG["min_contracts"]:
        return _empty_timeframe(f"only {len(rows)} contracts in {tf_name} bucket")

    # ── A & B: Gaussian-weighted exposure aggregation ─────────────────────
    # We accumulate TOTAL weighted sums (not per-contract averages) so that
    # the normaliser thresholds reflect realistic aggregate dollar amounts.
    w_dex   = 0.0
    w_vanna = 0.0
    w_charm = 0.0   # additionally time-weighted by 1/√DTE

    for row in rows:
        gw  = _gw(row.contract.strike, spot)
        dte = _dte_of(row, now_utc)
        tw  = 1.0 / math.sqrt(max(float(dte), 0.25))   # time weight for charm

        w_dex   += gw * _sf(row.dex)
        w_vanna += gw * _sf(row.vanna_exposure)
        w_charm += gw * tw * _sf(row.charm_exposure)

    # ── C: Sub-scores ─────────────────────────────────────────────────────
    iv_dir = _iv_direction(iv_summary)

    scores: dict[str, BiasSubScore] = {k: _neutral_sub() for k in _ALL_SCORES}
    scores["dex"]   = _score_dex(w_dex)
    scores["vanna"] = _score_vanna(w_vanna, iv_dir)
    scores["charm"] = _score_charm(w_charm)
    scores["skew"]  = _score_skew(iv_summary)
    scores["term"]  = _score_term(iv_summary)
    scores["pcr"]   = _score_pcr(
        flow_metrics.pcr_oi if flow_metrics else None,
        pcr_history,
    )
    scores["walls"] = _score_walls(
        spot,
        gex_profile.largest_call_wall,
        gex_profile.largest_put_wall,
    )

    # ── D: Weighted combination → directional_raw ─────────────────────────
    weights = _CFG["weights"][tf_name]
    w_sum   = sum(weights.values())

    directional_raw = 0.0
    avg_conf        = 0.0
    for sig, wt in weights.items():
        sc = scores.get(sig, _neutral_sub())
        nw = wt / w_sum
        directional_raw += nw * sc.score
        avg_conf        += nw * sc.confidence

    # ── E: Gamma amplifier ────────────────────────────────────────────────
    # amplifier = 1 + k × (−γ_regime)
    # · γ_regime = −1 (max short gamma) → amplifier = 1 + k = 1.5
    # · γ_regime = +1 (max long gamma)  → amplifier = 1 − k = 0.5
    amplifier = 1.0 + _CFG["k"] * (-gamma_regime)
    amplifier = max(0.10, amplifier)   # floor to prevent sign flip

    biased = directional_raw * amplifier

    # ── F: Gates ──────────────────────────────────────────────────────────
    gate: str | None = None
    total_gex = _sf(gex_profile.total_gex)
    iv_rank   = _sf(iv_summary.iv_rank) if iv_summary and iv_summary.iv_rank is not None else 0.0

    # Vol-expansion gate: high iv_rank + backwardation + short gamma
    if (
        iv_rank   > _CFG["vol_gate_ivr_min"]
        and _is_term_inverted(iv_summary)
        and total_gex < _CFG["vol_gate_gex_max"]
    ):
        gate = "vol_expansion"

    # Pin gate: near max pain + long gamma + between walls + intraday bucket
    if gate is None and tf_name == "intraday":
        max_pain  = _sf(flow_metrics.max_pain) if flow_metrics and flow_metrics.max_pain else None
        near_pain = (
            max_pain is not None
            and spot > 0
            and abs(spot - max_pain) / spot < _CFG["pin_pain_band"]
        )
        between_walls = (
            gex_profile.largest_call_wall is not None
            and gex_profile.largest_put_wall is not None
            and gex_profile.largest_put_wall <= spot <= gex_profile.largest_call_wall
        )
        if (
            total_gex > _CFG["pin_gex_min"]
            and near_pain
            and between_walls
        ):
            gate = "pinned"
            biased *= _CFG["pin_bias_mult"]

    # ── G: tanh squash → [−100, +100] ─────────────────────────────────────
    final_bias = float(100.0 * math.tanh(biased * _CFG["tanh_scale"]))
    label      = _regime_label(final_bias, gate)

    return BiasTimeframe(
        bias=round(final_bias, 2),
        confidence=round(float(_clamp(avg_conf, 0.0, 1.0)), 3),
        label=label,
        gate=gate,
        contract_count=len(rows),
        sub_scores=scores,
    )


# ──────────────────────────────────────────────────────────────────────────────
#  MAIN ENTRY POINT
# ──────────────────────────────────────────────────────────────────────────────

def compute_bias(
    chain: ChainSnapshot,
    gex_profile: GEXProfile,
    iv_summary: IVSummary | None,
    flow_metrics: FlowMetrics | None,
    *,
    pcr_history: list[float] | None = None,
    now: datetime | None = None,
) -> BiasOutput:
    """
    Compute a four-timeframe conditional bias from an enriched options chain.

    Parameters
    ----------
    chain        : Enriched ChainSnapshot with per-contract greeks + exposures.
    gex_profile  : Aggregated GEXProfile (total_gex, walls, dealer_state).
    iv_summary   : IVSummary for skew, term structure, iv_rank.
    flow_metrics : FlowMetrics for PCR and max pain.
    pcr_history  : Optional rolling list of past PCR values for z-score baseline.
    now          : Reference datetime (defaults to UTC now).

    Returns
    -------
    BiasOutput with intraday / daily / weekly / monthly timeframes,
    plus the scalar gamma_regime and dealer_state.
    """
    now_dt  = now or datetime.now(UTC)
    now_utc = now_dt.astimezone(UTC) if now_dt.tzinfo else now_dt.replace(tzinfo=UTC)
    spot    = _sf(chain.underlying_price)

    # ── Gamma regime master variable ──────────────────────────────────────
    total_gex    = _sf(gex_profile.total_gex)
    gamma_regime = float(math.tanh(total_gex / _CFG["gex_norm"]))

    # ── Bucket contracts by DTE ───────────────────────────────────────────
    buckets: dict[str, list[ContractRow]] = {tf: [] for tf in _CFG["buckets"]}
    for row in chain.rows:
        exp    = row.contract.expiration
        exp_dt = datetime(exp.year, exp.month, exp.day, 16, 0, tzinfo=UTC)
        dte    = max(0, int((exp_dt - now_utc).total_seconds() / 86_400.0))
        for tf, (lo, hi) in _CFG["buckets"].items():
            if lo <= dte < hi:
                buckets[tf].append(row)
                break

    # ── Score each timeframe ──────────────────────────────────────────────
    def _tf(name: str) -> BiasTimeframe:
        return _score_timeframe(
            tf_name=name,
            rows=buckets[name],
            spot=spot,
            now_utc=now_utc,
            gex_profile=gex_profile,
            iv_summary=iv_summary,
            flow_metrics=flow_metrics,
            gamma_regime=gamma_regime,
            pcr_history=pcr_history,
        )

    return BiasOutput(
        intraday=_tf("intraday"),
        daily=_tf("daily"),
        weekly=_tf("weekly"),
        monthly=_tf("monthly"),
        gamma_regime=round(gamma_regime, 4),
        dealer_state=gex_profile.dealer_state,
        timestamp=now_utc,
    )


# ──────────────────────────────────────────────────────────────────────────────
#  UNIT TESTS  (run with: python -m app.analytics.bias_engine)
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    """Four scenario smoke tests."""
    from datetime import date, timedelta
    from app.schemas import (
        ChainSnapshot, ContractRow, FlowMetrics, GEXLevel, GEXProfile,
        GreeksSnapshot, IVSummary, OptionContract, OptionType,
    )

    def _make_chain(
        spot: float,
        n_strikes: int = 30,
        base_dte_days: int = 5,
        call_oi_mult: float = 1.0,
        put_oi_mult:  float = 1.0,
    ) -> ChainSnapshot:
        """Synthetic chain centred on spot with configurable OI skew."""
        now   = datetime.now(UTC)
        exp   = (now + timedelta(days=base_dte_days)).date()
        rows  = []
        for i in range(-n_strikes // 2, n_strikes // 2 + 1):
            k = round(spot * (1 + i * 0.005), 2)
            for otype, oi_mult in (
                (OptionType.CALL, call_oi_mult),
                (OptionType.PUT,  put_oi_mult),
            ):
                contract = OptionContract(
                    symbol=f"TEST{k}{otype.value[0].upper()}",
                    underlying="TEST",
                    expiration=exp,
                    strike=k,
                    option_type=otype,
                    open_interest=int(1000 * oi_mult),
                    volume=100,
                    implied_volatility=0.20,
                    underlying_price=spot,
                    timestamp=now,
                )
                is_call = otype == OptionType.CALL
                sign    = 1.0 if is_call else -1.0
                delta   = 0.52 if is_call else -0.48
                g = GreeksSnapshot(
                    delta=delta, gamma=0.02, theta=-0.05,
                    vega=0.10,  rho=0.01,   vanna=0.005,
                    charm=-0.001, vomma=0.001,
                )
                oi  = contract.open_interest
                m   = 100
                gex = sign * g.gamma * oi * m * spot * spot * 0.01
                dex = g.delta * oi * m * spot
                rows.append(ContractRow(
                    contract=contract, greeks=g,
                    gex=gex, dex=dex, vex=0.0,
                    vanna_exposure=sign * g.vanna * oi * m * spot,
                    charm_exposure=sign * g.charm * oi * m * spot / 365.0,
                ))
        return ChainSnapshot(
            underlying="TEST", underlying_price=spot,
            timestamp=datetime.now(UTC), rows=rows,
        )

    def _make_gex(spot: float, total_gex: float) -> GEXProfile:
        return GEXProfile(
            underlying="TEST", underlying_price=spot,
            timestamp=datetime.now(UTC), levels=[],
            total_gex=total_gex, total_dex=0.0,
            total_vex=0.0, total_vanna=0.0, total_charm=0.0,
            gamma_flip=spot * 0.99,
            largest_call_wall=spot * 1.02,
            largest_put_wall=spot * 0.98,
            dealer_state="long_gamma" if total_gex > 0 else "short_gamma",
        )

    def _make_iv(iv_rank: float, inverted: bool = False) -> IVSummary:
        return IVSummary(
            underlying="TEST", timestamp=datetime.now(UTC),
            atm_iv=0.22, iv_rank=iv_rank, iv_percentile=iv_rank,
            skew_25d=0.04, realized_vol_20d=0.18,
            term_structure={
                "1w": 0.25 if inverted else 0.20,
                "1m": 0.20,
                "3m": 0.20 if inverted else 0.22,
            },
            state="compression" if iv_rank < 30 else "expansion" if iv_rank > 70 else "normal",
        )

    def _make_fm(pcr: float, max_pain: float | None = None) -> FlowMetrics:
        return FlowMetrics(pcr_oi=pcr, max_pain=max_pain)

    spot = 500.0
    scenarios = [
        {
            "name": "Strong Bullish — long gamma, low PCR, call-heavy",
            "chain": _make_chain(spot, call_oi_mult=2.0, put_oi_mult=0.5),
            "gex":   _make_gex(spot, total_gex=5e8),
            "iv":    _make_iv(iv_rank=25.0),
            "fm":    _make_fm(pcr=0.55),
        },
        {
            "name": "Bearish — short gamma, high PCR, put skew",
            "chain": _make_chain(spot, call_oi_mult=0.5, put_oi_mult=2.0),
            "gex":   _make_gex(spot, total_gex=-3e8),
            "iv":    _make_iv(iv_rank=65.0),
            "fm":    _make_fm(pcr=1.55),
        },
        {
            "name": "Vol Expansion gate — high iv_rank + backwardation + short gamma",
            "chain": _make_chain(spot, base_dte_days=7),
            "gex":   _make_gex(spot, total_gex=-4e8),
            "iv":    _make_iv(iv_rank=82.0, inverted=True),
            "fm":    _make_fm(pcr=1.40),
        },
        {
            "name": "Neutral — balanced exposures, mid iv_rank",
            "chain": _make_chain(spot),
            "gex":   _make_gex(spot, total_gex=5e7),
            "iv":    _make_iv(iv_rank=48.0),
            "fm":    _make_fm(pcr=0.95),
        },
    ]

    print("\n=== Bias Engine Unit Tests ===\n")
    all_passed = True
    for s in scenarios:
        out = compute_bias(s["chain"], s["gex"], s["iv"], s["fm"])
        print(f"Scenario: {s['name']}")
        print(f"  gamma-regime : {out.gamma_regime:+.3f}  dealer={out.dealer_state}")
        for tf_name in ("intraday", "daily", "weekly", "monthly"):
            tf: BiasTimeframe = getattr(out, tf_name)
            print(
                f"  {tf_name:<10}: bias={tf.bias:+7.2f}  conf={tf.confidence:.2f}"
                f"  label='{tf.label}'"
                + (f"  gate={tf.gate}" if tf.gate else "")
                + f"  n={tf.contract_count}"
            )
        print()

    # Basic sanity assertions
    bullish_out = compute_bias(
        scenarios[0]["chain"], scenarios[0]["gex"], scenarios[0]["iv"], scenarios[0]["fm"]
    )
    assert bullish_out.daily.bias > 0, "Bullish scenario should produce positive daily bias"

    bearish_out = compute_bias(
        scenarios[1]["chain"], scenarios[1]["gex"], scenarios[1]["iv"], scenarios[1]["fm"]
    )
    assert bearish_out.daily.bias < 0, "Bearish scenario should produce negative daily bias"

    vol_out = compute_bias(
        scenarios[2]["chain"], scenarios[2]["gex"], scenarios[2]["iv"], scenarios[2]["fm"]
    )
    assert vol_out.intraday.gate == "vol_expansion" or vol_out.daily.gate == "vol_expansion", \
        "Vol expansion gate should fire"

    print("All assertions passed OK")
