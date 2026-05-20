"""Derive key support / resistance / magnet / dealer levels."""
from __future__ import annotations

from app.schemas import GEXProfile, KeyLevel


def key_levels_from_gex(gex: GEXProfile, *, top_n: int = 6) -> list[KeyLevel]:
    """Translate the most significant GEX strikes into KeyLevel entries."""
    levels: list[KeyLevel] = []
    if gex.gamma_flip is not None:
        levels.append(
            KeyLevel(
                price=gex.gamma_flip,
                label="Gamma Flip",
                kind="gamma_flip",
                strength=1.0,
                note="Dealer gamma sign-change zone",
            )
        )
    if gex.largest_call_wall is not None:
        levels.append(
            KeyLevel(
                price=gex.largest_call_wall,
                label="Call Wall",
                kind="call_wall",
                strength=0.9,
                note="Largest positive dealer gamma strike",
            )
        )
    if gex.largest_put_wall is not None:
        levels.append(
            KeyLevel(
                price=gex.largest_put_wall,
                label="Put Wall",
                kind="put_wall",
                strength=0.9,
                note="Largest negative dealer gamma strike",
            )
        )

    # Add a handful of high-OI magnet strikes
    enriched = sorted(
        gex.levels,
        key=lambda lv: lv.call_oi + lv.put_oi,
        reverse=True,
    )[:top_n]
    max_oi = max((lv.call_oi + lv.put_oi for lv in enriched), default=1) or 1
    for lv in enriched:
        levels.append(
            KeyLevel(
                price=lv.strike,
                label=f"OI Magnet {lv.strike:g}",
                kind="magnet",
                strength=(lv.call_oi + lv.put_oi) / max_oi * 0.7,
                note=f"call OI {lv.call_oi:,} / put OI {lv.put_oi:,}",
            )
        )

    # Deduplicate by price (round to nearest dollar) keeping the strongest
    deduped: dict[float, KeyLevel] = {}
    for lv in levels:
        key = round(lv.price, 2)
        if key not in deduped or deduped[key].strength < lv.strength:
            deduped[key] = lv
    return sorted(deduped.values(), key=lambda lv: lv.price)
