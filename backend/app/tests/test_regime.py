"""Smoke tests for the regime classifier."""
from __future__ import annotations

from datetime import UTC, datetime

from app.analytics.regime import classify
from app.schemas import (
    GEXLevel,
    GEXProfile,
    IVSummary,
)


def _gex(total_gex: float, flip: float, spot: float = 100.0, dealer: str = "long_gamma") -> GEXProfile:
    return GEXProfile(
        underlying="X",
        underlying_price=spot,
        timestamp=datetime.now(UTC),
        levels=[GEXLevel(strike=spot, call_gex=total_gex, net_gex=total_gex)],
        total_gex=total_gex,
        total_dex=0.0,
        total_vex=0.0,
        total_vanna=0.0,
        total_charm=0.0,
        gamma_flip=flip,
        largest_call_wall=spot + 5,
        largest_put_wall=spot - 5,
        dealer_state=dealer,
    )


def _iv(state: str = "normal", atm: float = 0.18) -> IVSummary:
    return IVSummary(
        underlying="X",
        timestamp=datetime.now(UTC),
        atm_iv=atm,
        iv_30d=atm,
        iv_rank=50,
        iv_percentile=50,
        realized_vol_20d=0.15,
        skew_25d=0.02,
        term_structure={"1w": atm, "3m": atm},
        state=state,
    )


def test_long_gamma_above_flip_yields_bullish_or_neutral() -> None:
    gex = _gex(total_gex=2e9, flip=95.0)
    iv = _iv()
    r = classify(gex=gex, iv=iv, flow_events=[], flow_sentiment_score=20.0)
    assert r.sentiment_score > 0
    assert r.intraday_bias in {"Bullish", "Strong Bullish", "Bullish Chop", "Neutral Chop"}
    assert r.mean_reversion_score > 0.4


def test_short_gamma_below_flip_yields_bearish_and_higher_squeeze_risk() -> None:
    gex = _gex(total_gex=-2e9, flip=105.0, dealer="short_gamma")
    gex.largest_call_wall = 101.0  # within 1% of spot → elevated squeeze
    iv = _iv(state="expansion")
    r = classify(gex=gex, iv=iv, flow_events=[], flow_sentiment_score=-20.0)
    assert r.sentiment_score < 0
    assert r.gamma_squeeze_risk > 0.5
    assert r.regime in {"Volatility Expansion", "Bearish", "Strong Bearish", "Bearish Chop"}


def test_expected_move_scales_with_sqrt_time() -> None:
    gex = _gex(total_gex=0.0, flip=100.0)
    iv = _iv(atm=0.20)
    r = classify(gex=gex, iv=iv, flow_events=[])
    assert r.expected_move_1d is not None and r.expected_move_1w is not None
    # 1w expected move should be roughly sqrt(7) times the 1d move
    ratio = r.expected_move_1w / r.expected_move_1d
    assert 2.4 < ratio < 2.8
