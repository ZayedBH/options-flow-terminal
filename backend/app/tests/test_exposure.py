"""Tests for the GEX/exposure aggregator using a synthetic chain."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from app.analytics.exposure import build_gex_profile, enrich_chain
from app.schemas import ChainSnapshot, OptionContract, OptionType


def _make_contract(
    strike: float,
    opt_type: OptionType,
    oi: int = 1000,
    iv: float = 0.2,
    spot: float = 100.0,
    dte: int = 30,
) -> OptionContract:
    exp = date.today() + timedelta(days=dte)
    return OptionContract(
        symbol=f"X{strike}{opt_type.value}",
        underlying="X",
        expiration=exp,
        strike=strike,
        option_type=opt_type,
        bid=1.0,
        ask=1.1,
        last=1.05,
        mid=1.05,
        volume=0,
        open_interest=oi,
        implied_volatility=iv,
        underlying_price=spot,
        timestamp=datetime.now(UTC),
    )


def test_build_gex_profile_basic_aggregation() -> None:
    spot = 100.0
    contracts = []
    for k in (90, 95, 100, 105, 110):
        contracts.append(_make_contract(k, OptionType.CALL, oi=500, spot=spot))
        contracts.append(_make_contract(k, OptionType.PUT, oi=500, spot=spot))
    rows = enrich_chain(contracts, spot)
    snap = ChainSnapshot(
        underlying="X",
        underlying_price=spot,
        timestamp=datetime.now(UTC),
        rows=rows,
    )
    gex = build_gex_profile(snap)
    assert len(gex.levels) == 5
    # call_gex positive, put_gex negative (dealer convention)
    for lv in gex.levels:
        assert lv.call_gex >= 0
        assert lv.put_gex <= 0
    # Symmetric construction → near-zero net total but non-zero exposures
    assert abs(gex.total_gex) < 5e7


def test_dealer_state_classification() -> None:
    """More call OI than put OI → dealer long gamma; reverse → short gamma."""
    spot = 100.0
    long_gamma_chain = [
        *(_make_contract(k, OptionType.CALL, oi=5000, spot=spot) for k in (95, 100, 105)),
        *(_make_contract(k, OptionType.PUT, oi=100, spot=spot) for k in (95, 100, 105)),
    ]
    rows = enrich_chain(long_gamma_chain, spot)
    snap = ChainSnapshot(
        underlying="X", underlying_price=spot, timestamp=datetime.now(UTC), rows=rows
    )
    gex = build_gex_profile(snap)
    assert gex.dealer_state == "long_gamma"
    assert gex.total_gex > 0

    short_gamma_chain = [
        *(_make_contract(k, OptionType.CALL, oi=100, spot=spot) for k in (95, 100, 105)),
        *(_make_contract(k, OptionType.PUT, oi=5000, spot=spot) for k in (95, 100, 105)),
    ]
    rows = enrich_chain(short_gamma_chain, spot)
    snap = ChainSnapshot(
        underlying="X", underlying_price=spot, timestamp=datetime.now(UTC), rows=rows
    )
    gex = build_gex_profile(snap)
    assert gex.dealer_state == "short_gamma"
    assert gex.total_gex < 0


def test_gamma_flip_detected_between_strikes() -> None:
    """Construct a chain where net GEX cumsum crosses zero between two strikes."""
    spot = 100.0
    contracts = [
        _make_contract(95, OptionType.PUT, oi=5000, spot=spot),
        _make_contract(98, OptionType.PUT, oi=5000, spot=spot),
        _make_contract(100, OptionType.CALL, oi=200, spot=spot),
        _make_contract(102, OptionType.CALL, oi=8000, spot=spot),
        _make_contract(105, OptionType.CALL, oi=8000, spot=spot),
    ]
    rows = enrich_chain(contracts, spot)
    snap = ChainSnapshot(
        underlying="X", underlying_price=spot, timestamp=datetime.now(UTC), rows=rows
    )
    gex = build_gex_profile(snap)
    # Cumulative net should cross zero somewhere within the strike range
    assert gex.gamma_flip is not None
    assert 95 <= gex.gamma_flip <= 105
