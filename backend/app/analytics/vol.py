"""Volatility analytics: IV rank/percentile, term structure, skew, expansion/compression."""
from __future__ import annotations

import math
from datetime import UTC, date
from statistics import median

import numpy as np

from app.schemas import ChainSnapshot, IVSummary, OptionType


def realized_vol(close_prices: list[float], window: int = 20) -> float | None:
    """Annualized realized volatility from log-returns over a rolling window."""
    if len(close_prices) < window + 1:
        return None
    arr = np.asarray(close_prices[-(window + 1):], dtype=float)
    log_ret = np.diff(np.log(arr))
    if log_ret.size < 2:
        return None
    sigma = float(np.std(log_ret, ddof=1))
    return sigma * math.sqrt(252)


def iv_rank(current_iv: float, history: list[float]) -> float | None:
    """0..100 ranking of current IV within its historical low/high range."""
    if not history or current_iv is None:
        return None
    hi = max(history)
    lo = min(history)
    if hi == lo:
        return 50.0
    rank = (current_iv - lo) / (hi - lo) * 100.0
    return max(0.0, min(100.0, rank))


def iv_percentile(current_iv: float, history: list[float]) -> float | None:
    """0..100 percentile of historical IVs <= current."""
    if not history or current_iv is None:
        return None
    below = sum(1 for v in history if v <= current_iv)
    return below / len(history) * 100.0


def atm_iv_from_chain(chain: ChainSnapshot, target_dte: int = 30) -> float | None:
    """Estimate ATM IV near a target days-to-expiry by linear interpolation in DTE."""
    if not chain.rows:
        return None
    now = chain.timestamp.astimezone(UTC) if chain.timestamp.tzinfo else chain.timestamp
    spot = chain.underlying_price
    by_exp: dict[date, list[tuple[float, float]]] = {}
    for row in chain.rows:
        if not row.greeks or row.contract.implied_volatility is None:
            continue
        by_exp.setdefault(row.contract.expiration, []).append(
            (abs(row.contract.strike - spot), row.contract.implied_volatility)
        )
    if not by_exp:
        return None
    atm_per_exp: dict[date, float] = {}
    for exp, lst in by_exp.items():
        lst.sort(key=lambda x: x[0])
        nearest = lst[:4]
        atm_per_exp[exp] = sum(v for _, v in nearest) / len(nearest)

    dte_to_iv = sorted(((exp - now.date()).days, iv) for exp, iv in atm_per_exp.items())
    dte_to_iv = [(d, iv) for d, iv in dte_to_iv if d > 0]
    if not dte_to_iv:
        return None

    # Pick two bracketing tenors around target_dte
    below = [t for t in dte_to_iv if t[0] <= target_dte]
    above = [t for t in dte_to_iv if t[0] >= target_dte]
    if below and above and below[-1][0] != above[0][0]:
        d0, v0 = below[-1]
        d1, v1 = above[0]
        w = (target_dte - d0) / (d1 - d0)
        return v0 * (1 - w) + v1 * w
    return dte_to_iv[min(range(len(dte_to_iv)), key=lambda i: abs(dte_to_iv[i][0] - target_dte))][1]


def term_structure(chain: ChainSnapshot) -> dict[str, float]:
    """Bucketed ATM IV per tenor label."""
    if not chain.rows:
        return {}
    now = chain.timestamp.astimezone(UTC) if chain.timestamp.tzinfo else chain.timestamp
    spot = chain.underlying_price

    buckets: dict[str, list[float]] = {
        "0dte": [],
        "1w": [],
        "2w": [],
        "1m": [],
        "2m": [],
        "3m": [],
        "6m": [],
        "1y+": [],
    }
    for row in chain.rows:
        if row.contract.implied_volatility is None:
            continue
        dte = (row.contract.expiration - now.date()).days
        if dte < 0:
            continue
        if dte <= 1:
            label = "0dte"
        elif dte <= 7:
            label = "1w"
        elif dte <= 14:
            label = "2w"
        elif dte <= 35:
            label = "1m"
        elif dte <= 70:
            label = "2m"
        elif dte <= 100:
            label = "3m"
        elif dte <= 200:
            label = "6m"
        else:
            label = "1y+"
        # restrict to near-the-money strikes for stability
        if abs(row.contract.strike - spot) / spot > 0.05:
            continue
        buckets[label].append(row.contract.implied_volatility)

    return {k: float(median(v)) for k, v in buckets.items() if v}


def skew_25_delta(chain: ChainSnapshot) -> float | None:
    """25-delta put IV minus 25-delta call IV using nearest 30-day expiry."""
    if not chain.rows:
        return None
    now = chain.timestamp.astimezone(UTC) if chain.timestamp.tzinfo else chain.timestamp
    target_dte = 30
    by_exp: dict[date, list] = {}
    for row in chain.rows:
        by_exp.setdefault(row.contract.expiration, []).append(row)
    if not by_exp:
        return None
    target_exp = min(
        by_exp.keys(),
        key=lambda e: abs((e - now.date()).days - target_dte),
    )
    rows = by_exp[target_exp]

    def closest(target_delta: float, opt_type: OptionType) -> float | None:
        cand = [
            r
            for r in rows
            if r.contract.option_type == opt_type
            and r.greeks is not None
            and r.contract.implied_volatility is not None
        ]
        if not cand:
            return None
        best = min(cand, key=lambda r: abs(abs(r.greeks.delta) - target_delta))
        return best.contract.implied_volatility

    put_iv = closest(0.25, OptionType.PUT)
    call_iv = closest(0.25, OptionType.CALL)
    if put_iv is None or call_iv is None:
        return None
    return put_iv - call_iv


def detect_vol_state(atm_iv: float | None, rv_20d: float | None, term: dict[str, float]) -> str:
    """Classify vol regime as expansion / compression / crush / normal."""
    if atm_iv is None:
        return "normal"
    front = term.get("1w") or term.get("0dte")
    back = term.get("3m") or term.get("6m") or term.get("1y+")
    if front is not None and back is not None:
        if front > back * 1.10:
            return "expansion"  # inverted curve, vol bid
        if front < back * 0.85:
            return "compression"
    if rv_20d is not None and atm_iv < rv_20d * 0.75:
        return "crush"
    return "normal"


def build_iv_summary(
    chain: ChainSnapshot,
    *,
    iv_history: list[float] | None = None,
    realized_vol_20d: float | None = None,
) -> IVSummary:
    atm = atm_iv_from_chain(chain)
    ts = term_structure(chain)
    sk = skew_25_delta(chain)
    rank = iv_rank(atm, iv_history) if atm is not None and iv_history else None
    pct = iv_percentile(atm, iv_history) if atm is not None and iv_history else None
    state = detect_vol_state(atm, realized_vol_20d, ts)
    return IVSummary(
        underlying=chain.underlying,
        timestamp=chain.timestamp,
        atm_iv=atm,
        iv_30d=atm,
        iv_rank=rank,
        iv_percentile=pct,
        realized_vol_20d=realized_vol_20d,
        skew_25d=sk,
        term_structure=ts,
        state=state,
    )
