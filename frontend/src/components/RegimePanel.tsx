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
      <div className="panel-hdr">
        <span>Market Regime · {underlying}</span>
        <span className="text-bb-muted normal-case font-mono font-normal">
          ${fmtPrice(underlyingPrice)}
        </span>
      </div>

      {!regime ? (
        <div className="px-2 py-3 text-bb-muted text-xs">No data yet…</div>
      ) : (
        <div>
          {/* Main regime label */}
          <div className="px-2 pt-2 pb-1 border-b border-bb-divider">
            <div className={`text-xl font-bold tracking-tight ${regimeColor(regime.regime)}`}>
              {regime.regime}
            </div>
            <div className="text-[10px] text-bb-muted mt-0.5 flex gap-3">
              <span>
                CONF{" "}
                <span className="text-bb-text">{fmtPctOf100(regime.confidence * 100)}</span>
              </span>
              <span>
                SENT{" "}
                <span
                  className={
                    regime.sentiment_score > 0
                      ? "text-bb-green"
                      : regime.sentiment_score < 0
                      ? "text-bb-red"
                      : "text-bb-muted"
                  }
                >
                  {regime.sentiment_score > 0 ? "+" : ""}
                  {regime.sentiment_score.toFixed(0)}
                </span>
              </span>
            </div>
          </div>

          {/* Bias grid */}
          <div className="grid grid-cols-3 border-b border-bb-divider">
            <BiasCell label="Intraday" value={regime.intraday_bias} />
            <BiasCell label="Daily" value={regime.daily_bias} border />
            <BiasCell label="Weekly" value={regime.weekly_bias} border />
          </div>

          {/* Stats */}
          <div className="py-1">
            <StatRow label="Vol State" value={regime.volatility_state} />
            <StatRow
              label="Exp Move 1D"
              value={regime.expected_move_1d !== null ? `±${fmtPrice(regime.expected_move_1d)}` : "—"}
            />
            <StatRow
              label="Exp Move 1W"
              value={regime.expected_move_1w !== null ? `±${fmtPrice(regime.expected_move_1w)}` : "—"}
            />
            <StatRow
              label="Squeeze Risk"
              value={fmtPctOf100(regime.gamma_squeeze_risk * 100)}
              accent={regime.gamma_squeeze_risk > 0.6 ? "text-bb-orange" : undefined}
            />
            <StatRow
              label="Mean Rev"
              value={fmtPctOf100(regime.mean_reversion_score * 100)}
            />
            <StatRow
              label="Trend Cont"
              value={fmtPctOf100(regime.trend_continuation_score * 100)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function BiasCell({ label, value, border }: { label: string; value: string; border?: boolean }) {
  return (
    <div className={`px-2 py-1.5 ${border ? "border-l border-bb-border" : ""}`}>
      <div className="text-[9px] uppercase tracking-widest text-bb-muted">{label}</div>
      <div className={`text-[11px] font-bold mt-0.5 ${biasColor(value)}`}>{value}</div>
    </div>
  );
}

function StatRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${accent ?? ""}`}>{value}</span>
    </div>
  );
}
