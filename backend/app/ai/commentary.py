"""AI commentary panel.

Priority chain:
  1. Anthropic Claude (if ANTHROPIC_API_KEY set)
  2. OpenAI (if OPENAI_API_KEY set)
  3. Deterministic template fallback (always available, no key required)
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
DEFAULT_CLAUDE_MODEL = "claude-haiku-4-5-20251001"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"

_SYSTEM_PROMPT = (
    "You are an institutional options-flow analyst. "
    "Write 2-4 dense sentences in terminal style, no fluff."
)


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
    if gex.gamma_flip is not None:
        lines.append(
            f"Dealers are {dealer_state}; total GEX {gex.total_gex / 1e9:+.2f}B. "
            f"Gamma flip: {gex.gamma_flip:.2f}."
        )
    else:
        lines.append(
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
                f"25-delta put skew {iv.skew_25d * 100:+.1f} vol pts — protection bid."
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
        lines.append("Long-gamma dealer hedging favors mean reversion intraday.")
    return " ".join(lines)


def _format_prompt(
    regime: RegimeClassification,
    gex: GEXProfile,
    iv: IVSummary,
    flow: list[FlowEvent],
) -> str:
    flow_brief = ", ".join(
        f"{f.option_type.value} {f.strike} {f.side.value} ${f.premium / 1000:.0f}k"
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


async def _anthropic_commentary(prompt: str, api_key: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                ANTHROPIC_URL,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": ANTHROPIC_VERSION,
                    "content-type": "application/json",
                },
                json={
                    "model": os.environ.get("CLAUDE_MODEL", DEFAULT_CLAUDE_MODEL),
                    "max_tokens": 300,
                    "system": _SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            r.raise_for_status()
            data = r.json()
            return data["content"][0]["text"].strip()
    except Exception:
        return None


async def _openai_commentary(prompt: str, api_key: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                OPENAI_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": os.environ.get("OPENAI_MODEL", DEFAULT_OPENAI_MODEL),
                    "messages": [
                        {"role": "system", "content": _SYSTEM_PROMPT},
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


async def build_commentary(
    regime: RegimeClassification,
    gex: GEXProfile,
    iv: IVSummary,
    flow: list[FlowEvent],
) -> str:
    """Return commentary: Claude → OpenAI → template fallback."""
    prompt = _format_prompt(regime, gex, iv, flow)

    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    if anthropic_key:
        result = await _anthropic_commentary(prompt, anthropic_key)
        if result:
            return result

    openai_key = os.environ.get("OPENAI_API_KEY")
    if openai_key:
        result = await _openai_commentary(prompt, openai_key)
        if result:
            return result

    return _template_commentary(regime, gex, iv, flow)
