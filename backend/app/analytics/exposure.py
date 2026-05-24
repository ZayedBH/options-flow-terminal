"""Aggregate exposures (GEX, DEX, VEX, Vanna, Charm) from a chain snapshot.

Conventions
-----------
* Contract multiplier is 100 for equity/ETF options (SPY, QQQ, etc.) and 100 for SPX too.
* GEX is reported as **dollar gamma per 1% spot move**:
      gex_$ = gamma * OI * multiplier * S * S * 0.01
  Calls add positive dealer-side gamma (dealers short calls → short gamma) per the
  industry convention used by SqueezeMetrics/SpotGamma: assume dealers are LONG calls
  and SHORT puts when sold to retail. Equivalently: net dealer gamma at a strike
  ~ call OI * gamma - put OI * gamma (sign flipped on puts).
* DEX is dollar delta: delta * OI * multiplier * S.
* The "gamma flip" level is the strike at which cumulative net GEX crosses zero
  when stepping outward from spot.
"""
from __future__ import annotations

import math
from datetime import UTC, datetime

import numpy as np

from app.analytics.greeks import BlackScholesInputs, compute_greeks, implied_volatility
from app.schemas import (
    ChainSnapshot,
    ContractRow,
    GEXLevel,
    GEXProfile,
    GreeksSnapshot,
    OptionContract,
    OptionType,
)

CONTRACT_MULTIPLIER = 100


def _year_fraction(expiration_date, now: datetime) -> float:
    """Return time-to-expiry in years, never less than 1 trading hour."""
    expiry_dt = datetime.combine(expiration_date, datetime.min.time()).replace(
        hour=16, minute=0, tzinfo=UTC
    )
    now_utc = now.astimezone(UTC) if now.tzinfo else now.replace(tzinfo=UTC)
    seconds = (expiry_dt - now_utc).total_seconds()
    return max(seconds / (365.25 * 24 * 3600), 1.0 / (365.25 * 24))


def enrich_chain(
    chain_rows: list[OptionContract],
    underlying_price: float,
    *,
    risk_free_rate: float = 0.045,
    dividend_yield: float = 0.0,
    now: datetime | None = None,
) -> list[ContractRow]:
    """Compute greeks and per-contract exposures for every row in a chain."""
    now = now or datetime.now(UTC)
    out: list[ContractRow] = []
    for c in chain_rows:
        T = _year_fraction(c.expiration, now)
        mark = c.mark
        sigma = c.implied_volatility
        if (sigma is None or sigma <= 0) and mark is not None and mark > 0:
            sigma = implied_volatility(
                market_price=mark,
                S=underlying_price,
                K=c.strike,
                T=T,
                r=risk_free_rate,
                q=dividend_yield,
                is_call=c.option_type == OptionType.CALL,
            )
        if sigma is None or sigma <= 0 or not math.isfinite(sigma):
            out.append(ContractRow(contract=c))
            continue

        try:
            g = compute_greeks(
                BlackScholesInputs(
                    S=underlying_price,
                    K=c.strike,
                    T=T,
                    sigma=sigma,
                    r=risk_free_rate,
                    q=dividend_yield,
                    is_call=c.option_type == OptionType.CALL,
                )
            )
        except ValueError:
            out.append(ContractRow(contract=c))
            continue

        oi = c.open_interest or 0
        s2 = underlying_price * underlying_price
        # Dealer-convention sign: calls long-gamma for dealers, puts short-gamma.
        sign = 1.0 if c.option_type == OptionType.CALL else -1.0
        gex = sign * g.gamma * oi * CONTRACT_MULTIPLIER * s2 * 0.01
        dex = g.delta * oi * CONTRACT_MULTIPLIER * underlying_price
        vex = g.vega_per_volpoint * oi * CONTRACT_MULTIPLIER
        vanna_exp = sign * g.vanna * oi * CONTRACT_MULTIPLIER * underlying_price
        charm_exp = sign * g.charm * oi * CONTRACT_MULTIPLIER * underlying_price / 365.0

        out.append(
            ContractRow(
                contract=c,
                greeks=GreeksSnapshot(
                    delta=g.delta,
                    gamma=g.gamma,
                    theta=g.theta_per_day,
                    vega=g.vega_per_volpoint,
                    rho=g.rho,
                    vanna=g.vanna,
                    charm=g.charm / 365.0,
                    vomma=g.vomma,
                ),
                gex=gex,
                dex=dex,
                vex=vex,
                vanna_exposure=vanna_exp,
                charm_exposure=charm_exp,
            )
        )
    return out


def build_gex_profile(chain: ChainSnapshot) -> GEXProfile:
    """Aggregate per-strike exposures and derive summary statistics."""
    by_strike: dict[float, GEXLevel] = {}
    total_gex = total_dex = total_vex = total_vanna = total_charm = 0.0
    for row in chain.rows:
        k = row.contract.strike
        level = by_strike.setdefault(k, GEXLevel(strike=k))
        if row.contract.option_type == OptionType.CALL:
            level.call_gex += row.gex
            level.call_oi += row.contract.open_interest or 0
        else:
            level.put_gex += row.gex
            level.put_oi += row.contract.open_interest or 0
        level.net_gex = level.call_gex + level.put_gex
        level.net_dex += row.dex
        total_gex += row.gex
        total_dex += row.dex
        total_vex += row.vex
        total_vanna += row.vanna_exposure
        total_charm += row.charm_exposure

    levels = sorted(by_strike.values(), key=lambda lv: lv.strike)
    gamma_flip = _find_gamma_flip(levels, chain.underlying_price)
    call_wall = _largest_call_wall(levels)
    put_wall = _largest_put_wall(levels)
    dealer_state = (
        "long_gamma" if total_gex > 0 else "short_gamma" if total_gex < 0 else "neutral"
    )

    return GEXProfile(
        underlying=chain.underlying,
        underlying_price=chain.underlying_price,
        timestamp=chain.timestamp,
        levels=levels,
        total_gex=total_gex,
        total_dex=total_dex,
        total_vex=total_vex,
        total_vanna=total_vanna,
        total_charm=total_charm,
        gamma_flip=gamma_flip,
        largest_call_wall=call_wall,
        largest_put_wall=put_wall,
        dealer_state=dealer_state,
    )


def _find_gamma_flip(levels: list[GEXLevel], spot: float) -> float | None:
    """Return the strike at which cumulative net GEX flips sign nearest to spot."""
    if not levels:
        return None
    strikes = np.array([lv.strike for lv in levels])
    net = np.array([lv.net_gex for lv in levels])
    cum = np.cumsum(net)
    # Find sign changes
    sign = np.sign(cum)
    flips: list[float] = []
    for i in range(1, len(sign)):
        if sign[i - 1] != 0 and sign[i] != 0 and sign[i - 1] != sign[i]:
            # Linear-interpolate the crossing strike
            x0, x1 = strikes[i - 1], strikes[i]
            y0, y1 = cum[i - 1], cum[i]
            if y1 - y0 != 0:
                flips.append(x0 - y0 * (x1 - x0) / (y1 - y0))
            else:
                flips.append((x0 + x1) / 2)
    if not flips:
        return None
    return float(min(flips, key=lambda p: abs(p - spot)))


def _largest_call_wall(levels: list[GEXLevel]) -> float | None:
    candidates = [lv for lv in levels if lv.call_gex > 0]
    if not candidates:
        return None
    return max(candidates, key=lambda lv: lv.call_gex).strike


def _largest_put_wall(levels: list[GEXLevel]) -> float | None:
    candidates = [lv for lv in levels if lv.put_gex < 0]
    if not candidates:
        return None
    return min(candidates, key=lambda lv: lv.put_gex).strike
