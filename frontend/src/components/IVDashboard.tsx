import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IVSummary } from "../types";
import { fmtPct, fmtPctOf100 } from "../lib/format";

interface Props {
  iv: IVSummary | null;
}

const TENOR_ORDER = ["0dte", "1w", "2w", "1m", "2m", "3m", "6m", "1y+"];

export function IVDashboard({ iv }: Props) {
  if (!iv) {
    return (
      <div className="panel">
        <div className="panel-hdr">Volatility</div>
        <div className="px-3 py-3 text-bb-muted text-xs">No data yet…</div>
      </div>
    );
  }

  const stateHex =
    iv.state === "expansion"   ? "#ff6600" :
    iv.state === "compression" ? "#22d3ee" :
    iv.state === "crush"       ? "#ff3333" : "#555";

  const rankHex = iv.iv_rank != null
    ? iv.iv_rank > 70 ? "#ff3333" : iv.iv_rank > 40 ? "#ff8c00" : "#00d04a"
    : "#555";

  const skewHex = iv.skew_25d != null && iv.skew_25d > 0.04 ? "#ff6600" : undefined;

  const data = TENOR_ORDER
    .filter((t) => iv.term_structure[t] !== undefined)
    .map((t) => ({ tenor: t, iv: iv.term_structure[t] * 100 }));

  return (
    <div className="panel">
      <div className="panel-hdr">
        <span>Volatility · {iv.underlying}</span>
        <span
          className="normal-case font-mono font-bold text-[10px]"
          style={{ color: stateHex, textShadow: `0 0 8px ${stateHex}60` }}
        >
          {iv.state.toUpperCase()}
        </span>
      </div>

      <div className="py-1" style={{ borderBottom: "1px solid #111" }}>
        <GlowRow label="ATM IV"    value={fmtPct(iv.atm_iv)}          hex="#ff8c00" />
        <GlowRow label="IV Rank"   value={fmtPctOf100(iv.iv_rank)}    hex={rankHex} />
        <GlowRow label="IV %ile"   value={fmtPctOf100(iv.iv_percentile)} />
        <GlowRow
          label="RV 20D"
          value={iv.realized_vol_20d !== null ? fmtPct(iv.realized_vol_20d) : "—"}
          hex="#4da6ff"
        />
        <GlowRow
          label="25Δ Skew"
          value={iv.skew_25d !== null ? fmtPct(iv.skew_25d) : "—"}
          hex={skewHex}
        />
      </div>

      {/* Term structure sparkline */}
      {data.length > 0 && (
        <div className="h-24 px-1 pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 2, right: 8, bottom: 2, left: 0 }}>
              <CartesianGrid stroke="#111" strokeDasharray="2 2" />
              <XAxis dataKey="tenor" stroke="#222" fontSize={8} tick={{ fill: "#444" }} />
              <YAxis
                stroke="#222"
                fontSize={8}
                tick={{ fill: "#444" }}
                tickFormatter={(v) => `${(v as number).toFixed(0)}%`}
                width={28}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#070707",
                  border: "1px solid #1e1e1e",
                  fontSize: 10,
                  fontFamily: "monospace",
                }}
                formatter={(v: number) => [`${v.toFixed(2)}%`, "IV"]}
              />
              <Line
                type="monotone"
                dataKey="iv"
                stroke="#ff8c00"
                strokeWidth={1.5}
                dot={{ r: 2, fill: "#ff8c00", strokeWidth: 0 }}
                activeDot={{ r: 3 }}
                style={{ filter: "drop-shadow(0 0 4px #ff8c0080)" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function GlowRow({ label, value, hex }: { label: string; value: string; hex?: string }) {
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
