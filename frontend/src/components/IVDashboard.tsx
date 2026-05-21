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
        <div className="panel-title">Volatility</div>
        <div className="text-zinc-500 text-sm">No data yet…</div>
      </div>
    );
  }
  const data = TENOR_ORDER.filter((t) => iv.term_structure[t] !== undefined).map(
    (t) => ({ tenor: t, iv: iv.term_structure[t] * 100 })
  );

  return (
    <div className="panel">
      <div className="panel-title">
        <span>Volatility · {iv.underlying}</span>
        <span
          className={
            iv.state === "expansion"
              ? "text-orange-300 normal-case"
              : iv.state === "compression"
              ? "text-cyan-300 normal-case"
              : iv.state === "crush"
              ? "text-rose-400 normal-case"
              : "text-zinc-500 normal-case"
          }
        >
          {iv.state}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <Stat label="ATM IV" value={fmtPct(iv.atm_iv)} />
        <Stat label="IV Rank" value={fmtPctOf100(iv.iv_rank)} />
        <Stat label="IV %ile" value={fmtPctOf100(iv.iv_percentile)} />
        <Stat
          label="RV 20d"
          value={iv.realized_vol_20d !== null ? fmtPct(iv.realized_vol_20d) : "—"}
        />
        <Stat
          label="25Δ Skew"
          value={iv.skew_25d !== null ? fmtPct(iv.skew_25d) : "—"}
          accent={
            iv.skew_25d !== null && iv.skew_25d > 0.04
              ? "text-orange-300"
              : "text-zinc-200"
          }
        />
        <Stat label="State" value={iv.state} />
      </div>

      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
            <XAxis dataKey="tenor" stroke="#71717a" fontSize={10} />
            <YAxis
              stroke="#71717a"
              fontSize={10}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#111114",
                border: "1px solid #27272a",
                fontSize: 11,
              }}
              formatter={(v: number) => `${v.toFixed(2)}%`}
            />
            <Line
              type="monotone"
              dataKey="iv"
              stroke="#22d3ee"
              strokeWidth={2}
              dot={{ r: 3, fill: "#22d3ee" }}
            />
          </LineChart>
        </ResponsiveContainer>
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
      <span className={`font-mono ${accent ?? "text-zinc-200"}`}>{value}</span>
    </div>
  );
}
