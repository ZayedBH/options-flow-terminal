"""AI commentary panel.

Uses an LLM if `OPENAI_API_KEY` is configured; otherwise falls back to a
deterministic template that produces useful, terminal-style sentences from the
structured signal payload. The fallback path is always available so the system
works offline / without a paid LLM key.
"""
from __future__ import annotations

import os
from textwrap import dedent

import httpx

from app.schemas import (
    FlowEvent,
    FlowSide,
    GEXProfile,
    IVSummary,
    RegimeClassification,
)

DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"


def _template_commentary(
    regime: RegimeClassification,
    gex: GEXProfile,
    iv: IVSummary,
    flow: list[FlowEvent],
) -> str:
    lines: list[str] = []
    lines.append(
        f"Regime: {regime.regime} (confidence {regime.confidence * 100:.0f}%). "
        f"Sentiment score {regime.sentiment_score:+.0f}."
    )
    dealer_state = gex.dealer_state.replace("_", " ")
    lines.append(
        f"Dealers are {dealer_state}; total GEX {gex.total_gex / 1e9:+.2f}B. "
        f"Gamma flip: {gex.gamma_flip:.2f}." if gex.gamma_flip is not None else
        f"Dealers are {dealer_state}; total GEX {gex.total_gex / 1e9:+.2f}B."
    )
    if gex.largest_call_wall is not None and gex.largest_put_wall is not None:
        lines.append(
            f"Call wall {gex.largest_call_wall:.2f} acts as resistance; "
            f"put wall {gex.largest_put_wall:.2f} acts as support."
        )
    if iv.atm_iv is not None:
        rank_part = f", IV rank {iv.iv_rank:.0f}" if iv.iv_rank is not None else ""
        lines.append(
            f"ATM IV {iv.atm_iv * 100:.1f}%{rank_part}; vol state: {iv.state}."
        )
    if iv.skew_25d is not None:
        if iv.skew_25d > 0.04:
            lines.append(
                f"25-delta put skew {iv.skew_25d * 100:+.1f} vol points — protection bid."
            )
        elif iv.skew_25d < -0.01:
            lines.append(
                f"Call skew {iv.skew_25d * 100:+.1f} — chase / right-tail bid."
            )

    if regime.expected_move_1d is not None and regime.expected_move_1w is not None:
        lines.append(
            f"Expected move: 1d ±{regime.expected_move_1d:.2f}, "
            f"1w ±{regime.expected_move_1w:.2f}."
        )

    bullish_flow = sum(1 for f in flow if f.side == FlowSide.BULLISH)
    bearish_flow = sum(1 for f in flow if f.side == FlowSide.BEARISH)
    if flow:
        lines.append(
            f"Flow tape: {bullish_flow} bullish vs {bearish_flow} bearish notable prints."
        )

    if regime.gamma_squeeze_risk >= 0.6:
        lines.append(
            f"Gamma squeeze risk elevated ({regime.gamma_squeeze_risk * 100:.0f}%) — "
            "short-gamma dealers with call wall in range."
        )
    if regime.mean_reversion_score >= 0.6:
        lines.append(
            "Long-gamma dealer hedging favors mean reversion intraday."
        )
    return " ".join(lines)


async def _openai_commentary(prompt: str, api_key: str) -> str | None:
    """Call OpenAI Chat Completions; return None on any error."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                OPENAI_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": os.environ.get("OPENAI_MODEL", DEFAULT_OPENAI_MODEL),
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are an institutional options-flow analyst. "
                                "Write 2-4 dense sentences in terminal style, no fluff."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 240,
                },
            )
            r.raise_for_status()
            data = r.json()
            return data["choices"][0]["message"]["content"].strip()
    except Exception:
        return None


def _format_prompt(
    regime: RegimeClassification,
    gex: GEXProfile,
    iv: IVSummary,
    flow: list[FlowEvent],
) -> str:
    flow_brief = ", ".join(
        f"{f.option_type.value} {f.strike} {f.side.value} ${f.premium/1000:.0f}k"
        for f in flow[:6]
    )
    return dedent(
        f"""
        Underlying: {regime.underlying} at {gex.underlying_price:.2f}
        Regime: {regime.regime} (confidence {regime.confidence:.2f})
        Daily bias: {regime.daily_bias}, Weekly: {regime.weekly_bias}
        Dealer state: {gex.dealer_state} | Total GEX: {gex.total_gex:+.2e}
        Gamma flip: {gex.gamma_flip}
        Call wall: {gex.largest_call_wall} | Put wall: {gex.largest_put_wall}
        ATM IV: {iv.atm_iv} | IV state: {iv.state} | Skew25d: {iv.skew_25d}
        Expected move: 1d ±{regime.expected_move_1d} | 1w ±{regime.expected_move_1w}
        Flow highlights: {flow_brief or 'none'}
        Squeeze risk: {regime.gamma_squeeze_risk:.2f}; mean-rev score: {regime.mean_reversion_score:.2f}.

        Write a concise commentary explaining the current setup and what to watch.
        """
    ).strip()


async def build_commentary(
    regime: RegimeClassification,
    gex: GEXProfile,
    iv: IVSummary,
    flow: list[FlowEvent],
) -> str:
    """Return commentary, using OpenAI if available else the template fallback."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if api_key:
        prompt = _format_prompt(regime, gex, iv, flow)
        result = await _openai_commentary(prompt, api_key)
        if result:
            return result
    return _template_commentary(regime, gex, iv, flow)
