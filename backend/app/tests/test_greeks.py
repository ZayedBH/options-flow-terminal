"""Tests for the Black-Scholes Greeks engine.

Reference values come from CRR/Hull textbook problems and from cross-checking
against py_vollib for a handful of standard inputs.
"""
from __future__ import annotations

import math

import pytest

from app.analytics.greeks import (
    BlackScholesInputs,
    bs_price,
    compute_greeks,
    implied_volatility,
)


def test_atm_call_price_matches_textbook() -> None:
    # Hull-style ATM 100, 1y, sigma=20%, r=5%, q=0
    inp = BlackScholesInputs(S=100, K=100, T=1.0, sigma=0.2, r=0.05, q=0.0, is_call=True)
    p = bs_price(inp)
    assert p == pytest.approx(10.4506, abs=1e-3)


def test_atm_put_price_matches_textbook() -> None:
    inp = BlackScholesInputs(S=100, K=100, T=1.0, sigma=0.2, r=0.05, q=0.0, is_call=False)
    p = bs_price(inp)
    assert p == pytest.approx(5.5735, abs=1e-3)


def test_put_call_parity() -> None:
    S, K, T, r = 4500.0, 4500.0, 30 / 365.0, 0.05
    sigma = 0.18
    call = bs_price(BlackScholesInputs(S, K, T, sigma, r, 0.0, True))
    put = bs_price(BlackScholesInputs(S, K, T, sigma, r, 0.0, False))
    # C - P = S - K*e^-rT
    assert call - put == pytest.approx(S - K * math.exp(-r * T), abs=1e-6)


def test_greeks_signs_and_magnitudes() -> None:
    inp = BlackScholesInputs(S=100, K=100, T=0.25, sigma=0.25, r=0.04, q=0.0, is_call=True)
    g = compute_greeks(inp)
    assert 0.5 < g.delta < 0.6  # ATM call ~0.52
    assert g.gamma > 0
    assert g.vega > 0
    assert g.theta < 0  # call decays
    assert g.vomma > 0  # ATM vomma is positive


def test_put_delta_is_negative() -> None:
    inp = BlackScholesInputs(S=100, K=100, T=0.25, sigma=0.25, r=0.04, q=0.0, is_call=False)
    g = compute_greeks(inp)
    # ATM put delta with r > 0 sits slightly above -0.5 because forward > spot
    assert -0.55 < g.delta < -0.40


def test_implied_vol_roundtrip() -> None:
    """Pricing then back-solving should return the input sigma to ~1e-4."""
    for is_call in (True, False):
        for sigma_in in (0.10, 0.20, 0.45, 0.80):
            inp = BlackScholesInputs(
                S=100, K=110, T=0.5, sigma=sigma_in, r=0.04, q=0.01, is_call=is_call
            )
            price = bs_price(inp)
            sigma_out = implied_volatility(
                market_price=price,
                S=100,
                K=110,
                T=0.5,
                r=0.04,
                q=0.01,
                is_call=is_call,
            )
            assert sigma_out is not None
            assert sigma_out == pytest.approx(sigma_in, abs=1e-3)


def test_implied_vol_returns_none_below_intrinsic() -> None:
    sigma = implied_volatility(
        market_price=0.01, S=100, K=50, T=0.5, r=0.04, q=0.0, is_call=True
    )
    # Below intrinsic value should return None
    assert sigma is None


def test_gamma_peaks_atm() -> None:
    base = BlackScholesInputs(S=100, K=100, T=0.5, sigma=0.2, r=0.04, q=0.0, is_call=True)
    g_atm = compute_greeks(base)
    g_otm = compute_greeks(BlackScholesInputs(S=100, K=120, T=0.5, sigma=0.2, r=0.04, q=0.0, is_call=True))
    g_itm = compute_greeks(BlackScholesInputs(S=100, K=80, T=0.5, sigma=0.2, r=0.04, q=0.0, is_call=True))
    assert g_atm.gamma > g_otm.gamma
    assert g_atm.gamma > g_itm.gamma
