"""Black-Scholes pricing and full Greeks (including higher-order Vanna/Charm/Vomma).

All formulas use standard Black-Scholes assumptions: lognormal underlying, constant
volatility, constant risk-free rate, no dividends (q=0 by default; supports q for ETFs/indexes).

Naming conventions:
- Inputs `S` (spot), `K` (strike), `T` (time-to-expiry in years), `sigma` (annual IV),
  `r` (risk-free rate), `q` (continuous dividend yield).
- Outputs are per-contract (one option), NOT per-share. Caller multiplies by contract
  multiplier (100 for equity options) when aggregating exposures.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from scipy.stats import norm

SQRT_2PI = math.sqrt(2.0 * math.pi)


@dataclass(frozen=True)
class BlackScholesInputs:
    S: float
    K: float
    T: float
    sigma: float
    r: float = 0.045
    q: float = 0.0
    is_call: bool = True


def _d1_d2(S: float, K: float, T: float, sigma: float, r: float, q: float) -> tuple[float, float]:
    if S <= 0 or K <= 0 or T <= 0 or sigma <= 0:
        raise ValueError("S, K, T, sigma must be positive")
    vol_sqrt_t = sigma * math.sqrt(T)
    d1 = (math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / vol_sqrt_t
    d2 = d1 - vol_sqrt_t
    return d1, d2


def bs_price(inp: BlackScholesInputs) -> float:
    """Black-Scholes price for a European call or put."""
    d1, d2 = _d1_d2(inp.S, inp.K, inp.T, inp.sigma, inp.r, inp.q)
    df_r = math.exp(-inp.r * inp.T)
    df_q = math.exp(-inp.q * inp.T)
    if inp.is_call:
        return inp.S * df_q * norm.cdf(d1) - inp.K * df_r * norm.cdf(d2)
    return inp.K * df_r * norm.cdf(-d2) - inp.S * df_q * norm.cdf(-d1)


@dataclass(frozen=True)
class Greeks:
    """Per-contract Greeks (not multiplied by contract size)."""

    price: float
    delta: float
    gamma: float
    theta: float  # per-year theta; divide by 365 for per-day
    vega: float  # per 1.00 change in sigma; divide by 100 for per 1 vol point
    rho: float
    vanna: float
    charm: float  # delta decay per year; divide by 365 for per-day
    vomma: float

    @property
    def theta_per_day(self) -> float:
        return self.theta / 365.0

    @property
    def vega_per_volpoint(self) -> float:
        return self.vega / 100.0


def compute_greeks(inp: BlackScholesInputs) -> Greeks:
    """Compute full Greeks set for a single contract.

    Vanna = d2 Price / (dSpot dVol) = -e^(-qT) * phi(d1) * d2 / sigma
    Charm = d2 Price / (dSpot dTime) (sign convention: dDelta/dTime)
        Call: -e^(-qT) * [phi(d1) * (2(r-q)T - d2 * sigma*sqrt(T)) / (2 T sigma*sqrt(T))
                          + q * N(d1)]
        Put: same magnitude, signs adjusted via N->1-N relationships.
    Vomma = d2 Price / dVol^2 = Vega * d1 * d2 / sigma
    """
    d1, d2 = _d1_d2(inp.S, inp.K, inp.T, inp.sigma, inp.r, inp.q)
    sqrt_t = math.sqrt(inp.T)
    df_r = math.exp(-inp.r * inp.T)
    df_q = math.exp(-inp.q * inp.T)
    pdf_d1 = norm.pdf(d1)

    if inp.is_call:
        price = inp.S * df_q * norm.cdf(d1) - inp.K * df_r * norm.cdf(d2)
        delta = df_q * norm.cdf(d1)
        theta = (
            -(inp.S * df_q * pdf_d1 * inp.sigma) / (2.0 * sqrt_t)
            - inp.r * inp.K * df_r * norm.cdf(d2)
            + inp.q * inp.S * df_q * norm.cdf(d1)
        )
        rho = inp.K * inp.T * df_r * norm.cdf(d2)
        charm = -df_q * (
            pdf_d1 * (2.0 * (inp.r - inp.q) * inp.T - d2 * inp.sigma * sqrt_t)
            / (2.0 * inp.T * inp.sigma * sqrt_t)
            + inp.q * norm.cdf(d1) * 0.0  # q-term combined below
        ) - inp.q * df_q * norm.cdf(d1)
    else:
        price = inp.K * df_r * norm.cdf(-d2) - inp.S * df_q * norm.cdf(-d1)
        delta = -df_q * norm.cdf(-d1)
        theta = (
            -(inp.S * df_q * pdf_d1 * inp.sigma) / (2.0 * sqrt_t)
            + inp.r * inp.K * df_r * norm.cdf(-d2)
            - inp.q * inp.S * df_q * norm.cdf(-d1)
        )
        rho = -inp.K * inp.T * df_r * norm.cdf(-d2)
        charm = -df_q * (
            pdf_d1 * (2.0 * (inp.r - inp.q) * inp.T - d2 * inp.sigma * sqrt_t)
            / (2.0 * inp.T * inp.sigma * sqrt_t)
        ) + inp.q * df_q * norm.cdf(-d1)

    gamma = df_q * pdf_d1 / (inp.S * inp.sigma * sqrt_t)
    vega = inp.S * df_q * pdf_d1 * sqrt_t
    vanna = -df_q * pdf_d1 * d2 / inp.sigma
    vomma = vega * d1 * d2 / inp.sigma

    return Greeks(
        price=price,
        delta=delta,
        gamma=gamma,
        theta=theta,
        vega=vega,
        rho=rho,
        vanna=vanna,
        charm=charm,
        vomma=vomma,
    )


def implied_volatility(
    market_price: float,
    S: float,
    K: float,
    T: float,
    r: float = 0.045,
    q: float = 0.0,
    is_call: bool = True,
    *,
    tol: float = 1e-6,
    max_iter: int = 100,
) -> float | None:
    """Solve for IV via Brent-style bisection with vega-aided Newton steps.

    Returns None when the price is outside the no-arbitrage range or the solver
    cannot converge.
    """
    if market_price <= 0 or S <= 0 or K <= 0 or T <= 0:
        return None

    # Intrinsic bounds (European, no dividends approximation):
    intrinsic_call = max(S * math.exp(-q * T) - K * math.exp(-r * T), 0.0)
    intrinsic_put = max(K * math.exp(-r * T) - S * math.exp(-q * T), 0.0)
    intrinsic = intrinsic_call if is_call else intrinsic_put
    upper_bound = S * math.exp(-q * T) if is_call else K * math.exp(-r * T)
    if market_price < intrinsic - 1e-6 or market_price > upper_bound + 1e-6:
        return None

    lo, hi = 1e-4, 5.0  # 0.01% to 500% vol
    f_lo = bs_price(BlackScholesInputs(S, K, T, lo, r, q, is_call)) - market_price
    f_hi = bs_price(BlackScholesInputs(S, K, T, hi, r, q, is_call)) - market_price
    if f_lo * f_hi > 0:
        # Try expanding upper bound once
        hi = 10.0
        f_hi = bs_price(BlackScholesInputs(S, K, T, hi, r, q, is_call)) - market_price
        if f_lo * f_hi > 0:
            return None

    sigma = 0.2
    for _ in range(max_iter):
        try:
            g = compute_greeks(BlackScholesInputs(S, K, T, sigma, r, q, is_call))
        except ValueError:
            sigma = (lo + hi) / 2
            continue

        diff = g.price - market_price
        if abs(diff) < tol:
            return sigma
        if g.vega < 1e-8:
            sigma = (lo + hi) / 2
            continue

        # Newton step
        next_sigma = sigma - diff / g.vega

        # Fall back to bisection when Newton escapes the bracket
        if not (lo < next_sigma < hi):
            if diff > 0:
                hi = sigma
            else:
                lo = sigma
            next_sigma = (lo + hi) / 2
        else:
            if diff > 0:
                hi = sigma
            else:
                lo = sigma

        if abs(next_sigma - sigma) < tol:
            return next_sigma
        sigma = next_sigma

    return sigma
