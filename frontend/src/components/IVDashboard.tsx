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
        <div className="px-2 py-3 text-bb-muted text-xs">No data yet…</div>
      </div>
    );
  }

  const stateColor =
    iv.state === "expansion"
      ? "text-bb-orange"
      : iv.state === "compression"
      ? "text-bb-cyan"
      : iv.state === "crush"
      ? "text-bb-red"
      : "text-bb-muted";

  const data = TENOR_ORDER.filter((t) => iv.term_structure[t] !== undefined).map((t) => ({
    tenor: t,
    iv: iv.term_structure[t] * 100,
  }));

  return (
    <div className="panel">
      <div className="panel-hdr">
        <span>Volatility · {iv.underlying}</span>
        <span className={`normal-case font-mono font-normal ${stateColor}`}>{iv.state}</span>
      </div>

      <div className="py-1 border-b border-bb-divider">
        <StatRow label="ATM IV" value={fmtPct(iv.atm_iv)} />
        <StatRow label="IV Rank" value={fmtPctOf100(iv.iv_rank)} />
        <StatRow label="IV %ile" value={fmtPctOf100(iv.iv_percentile)} />
        <StatRow
          label="RV 20D"
          value={iv.realized_vol_20d !== null ? fmtPct(iv.realized_vol_20d) : "—"}
        />
        <StatRow
          label="25Δ Skew"
          value={iv.skew_25d !== null ? fmtPct(iv.skew_25d) : "—"}
          accent={
            iv.skew_25d !== null && iv.skew_25d > 0.04 ? "text-bb-orange" : undefined
          }
        />
      </div>

      {/* Term structure sparkline */}
      {data.length > 0 && (
        <div className="h-24 px-1 pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 2, right: 8, bottom: 2, left: 0 }}>
              <CartesianGrid stroke="#1a1a1a" strokeDasharray="2 2" />
              <XAxis dataKey="tenor" stroke="#444" fontSize={9} tick={{ fill: "#666" }} />
              <YAxis
                stroke="#444"
                fontSize={9}
                tick={{ fill: "#666" }}
                tickFormatter={(v) => `${(v as number).toFixed(0)}%`}
                width={28}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0b0b0b",
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
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
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
