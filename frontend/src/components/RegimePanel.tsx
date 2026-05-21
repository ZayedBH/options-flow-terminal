import clsx from "clsx";
import type { RegimeClassification } from "../types";
import { biasColor, fmtPctOf100, fmtPrice, regimeColor } from "../lib/format";

interface Props {
  regime: RegimeClassification | null;
  underlying: string;
  underlyingPrice: number;
}

export function RegimePanel({ regime, underlying, underlyingPrice }: Props) {
  return (
    <div className="panel">
      <div className="panel-title">
        <span>Market Regime · {underlying}</span>
        <span className="text-zinc-500 normal-case">
          ${fmtPrice(underlyingPrice)}
        </span>
      </div>

      {!regime ? (
        <div className="text-zinc-500 text-sm">No data yet…</div>
      ) : (
        <div className="space-y-3">
          <div>
            <div
              className={clsx(
                "text-2xl font-bold tracking-tight",
                regimeColor(regime.regime)
              )}
            >
              {regime.regime}
            </div>
            <div className="text-xs text-zinc-400 mt-1">
              confidence {fmtPctOf100(regime.confidence * 100)} · sentiment{" "}
              <span
                className={
                  regime.sentiment_score > 0
                    ? "text-emerald-400"
                    : regime.sentiment_score < 0
                    ? "text-rose-400"
                    : "text-zinc-400"
                }
              >
                {regime.sentiment_score > 0 ? "+" : ""}
                {regime.sentiment_score.toFixed(0)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <BiasCell label="Intraday" value={regime.intraday_bias} />
            <BiasCell label="Daily" value={regime.daily_bias} />
            <BiasCell label="Weekly" value={regime.weekly_bias} />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-terminal-border">
            <Stat label="Vol State" value={regime.volatility_state} />
            <Stat
              label="Expected Move 1d"
              value={
                regime.expected_move_1d !== null
                  ? `±${fmtPrice(regime.expected_move_1d)}`
                  : "—"
              }
            />
            <Stat
              label="Expected Move 1w"
              value={
                regime.expected_move_1w !== null
                  ? `±${fmtPrice(regime.expected_move_1w)}`
                  : "—"
              }
            />
            <Stat
              label="Squeeze Risk"
              value={fmtPctOf100(regime.gamma_squeeze_risk * 100)}
              accent={
                regime.gamma_squeeze_risk > 0.6
                  ? "text-orange-300"
                  : "text-zinc-300"
              }
            />
            <Stat
              label="Mean Rev Score"
              value={fmtPctOf100(regime.mean_reversion_score * 100)}
            />
            <Stat
              label="Trend Score"
              value={fmtPctOf100(regime.trend_continuation_score * 100)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function BiasCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-terminal-border bg-zinc-900/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className={clsx("text-xs font-semibold", biasColor(value))}>
        {value}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className={clsx("font-mono", accent ?? "text-zinc-200")}>
        {value}
      </span>
    </div>
  );
}
