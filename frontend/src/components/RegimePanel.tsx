import type { RegimeClassification } from "../types";
import { biasColor, fmtPctOf100, fmtPrice, regimeColor, regimeColorHex } from "../lib/format";

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
        <div className="px-3 py-3 text-bb-muted text-xs">No data yet…</div>
      ) : (
        <div>
          {/* Main regime label */}
          <div className="px-3 pt-3 pb-2"
            style={{ borderBottom: "1px solid #111" }}>
            <div
              className={`text-xl font-bold tracking-tight ${regimeColor(regime.regime)}`}
              style={{ textShadow: `0 0 18px ${regimeColorHex(regime.regime)}55` }}
            >
              {regime.regime}
            </div>
            <div className="text-[10px] mt-1 flex gap-4" style={{ color: "#444" }}>
              <span>
                CONF{" "}
                <span
                  className="font-bold"
                  style={{
                    color: regimeColorHex(regime.regime),
                    textShadow: `0 0 6px ${regimeColorHex(regime.regime)}50`,
                  }}
                >
                  {fmtPctOf100(regime.confidence * 100)}
                </span>
              </span>
              <span>
                SENT{" "}
                <span
                  className="font-bold"
                  style={{
                    color: regime.sentiment_score > 0 ? "#00d04a"
                      : regime.sentiment_score < 0 ? "#ff3333" : "#666",
                  }}
                >
                  {regime.sentiment_score > 0 ? "+" : ""}
                  {regime.sentiment_score.toFixed(0)}
                </span>
              </span>
            </div>
          </div>

          {/* Bias grid */}
          <div className="grid grid-cols-3" style={{ borderBottom: "1px solid #111" }}>
            <BiasCell label="Intraday" value={regime.intraday_bias} />
            <BiasCell label="Daily"    value={regime.daily_bias}    border />
            <BiasCell label="Weekly"   value={regime.weekly_bias}   border />
          </div>

          {/* Stats */}
          <div className="py-1">
            <StatRow label="Vol State"    value={regime.volatility_state} />
            <StatRow
              label="Exp Move 1D"
              value={regime.expected_move_1d !== null ? `±${fmtPrice(regime.expected_move_1d)}` : "—"}
              hex="#4da6ff"
            />
            <StatRow
              label="Exp Move 1W"
              value={regime.expected_move_1w !== null ? `±${fmtPrice(regime.expected_move_1w)}` : "—"}
              hex="#4da6ff"
            />
            <StatRow
              label="Squeeze Risk"
              value={fmtPctOf100(regime.gamma_squeeze_risk * 100)}
              hex={regime.gamma_squeeze_risk > 0.6 ? "#ff6600" : undefined}
            />
            <StatRow label="Mean Rev"   value={fmtPctOf100(regime.mean_reversion_score * 100)} />
            <StatRow label="Trend Cont" value={fmtPctOf100(regime.trend_continuation_score * 100)} />
          </div>
        </div>
      )}
    </div>
  );
}

function BiasCell({ label, value, border }: { label: string; value: string; border?: boolean }) {
  const hex = (() => {
    const v = value.toLowerCase();
    if (v.includes("strong bull") || v === "bullish") return "#00d04a";
    if (v.includes("bull")) return "#66e090";
    if (v.includes("strong bear") || v === "bearish") return "#ff3333";
    if (v.includes("bear")) return "#ff7777";
    return "#ff8c00";
  })();

  return (
    <div
      className={`px-3 py-2 ${border ? "border-l" : ""}`}
      style={{
        borderColor: "#111",
        background: `linear-gradient(180deg, ${hex}06 0%, transparent 100%)`,
      }}
    >
      <div className="text-[8px] uppercase tracking-widest mb-0.5" style={{ color: "#3a3a3a" }}>
        {label}
      </div>
      <div
        className={`text-[11px] font-bold ${biasColor(value)}`}
        style={{ textShadow: `0 0 8px ${hex}50` }}
      >
        {value}
      </div>
    </div>
  );
}

function StatRow({ label, value, hex }: { label: string; value: string; hex?: string }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span
        className="stat-value"
        style={hex ? { color: hex, textShadow: `0 0 6px ${hex}50` } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
