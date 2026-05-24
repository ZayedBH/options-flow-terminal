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
  underlying: string;
}

const TENOR_ORDER = ["0dte", "1w", "2w", "1m", "2m", "3m", "6m", "1y+"];

export function VolView({ iv, underlying }: Props) {
  if (!iv) {
    return (
      <div className="h-full flex items-center justify-center text-bb-muted text-sm">
        Waiting for volatility data…
      </div>
    );
  }

  const tsData = TENOR_ORDER.filter((t) => iv.term_structure[t] !== undefined).map((t) => ({
    tenor: t,
    iv: +(iv.term_structure[t] * 100).toFixed(2),
  }));

  const stateColor =
    iv.state === "expansion" ? "text-bb-orange"
    : iv.state === "compression" ? "text-bb-cyan"
    : iv.state === "crush" ? "text-bb-red"
    : "text-bb-muted";

  return (
    <div className="h-full grid grid-cols-12 gap-px bg-bb-border overflow-hidden">
      {/* Stats panel */}
      <div className="col-span-12 lg:col-span-3 flex flex-col overflow-y-auto">
        <div className="panel flex-1">
          <div className="panel-hdr">
            <span>Volatility · {underlying}</span>
            <span className={`normal-case font-mono font-normal ${stateColor}`}>
              {iv.state}
            </span>
          </div>

          <div className="py-1 border-b border-bb-divider">
            <Section label="Current" />
            <Row label="ATM IV (30D)" value={fmtPct(iv.atm_iv)} />
            <Row label="IV Rank" value={fmtPctOf100(iv.iv_rank)} />
            <Row label="IV Percentile" value={fmtPctOf100(iv.iv_percentile)} />
            <Row label="Realized Vol 20D" value={iv.realized_vol_20d !== null ? fmtPct(iv.realized_vol_20d) : "—"} />
          </div>

          <div className="py-1 border-b border-bb-divider">
            <Section label="Skew" />
            <Row
              label="25Δ Skew"
              value={iv.skew_25d !== null ? fmtPct(iv.skew_25d) : "—"}
              accent={iv.skew_25d !== null && iv.skew_25d > 0.04 ? "text-bb-orange" : undefined}
            />
            <Row label="State" value={iv.state} accent={stateColor} />
          </div>

          <div className="py-1">
            <Section label="Term Structure" />
            {TENOR_ORDER.filter((t) => iv.term_structure[t] !== undefined).map((t) => (
              <Row key={t} label={t.toUpperCase()} value={fmtPct(iv.term_structure[t])} />
            ))}
          </div>
        </div>
      </div>

      {/* Term structure chart */}
      <div className="col-span-12 lg:col-span-9 flex flex-col">
        <div className="panel flex-1">
          <div className="panel-hdr">
            <span>IV Term Structure</span>
            <span className="text-bb-muted font-normal normal-case">ATM IV by expiration tenor</span>
          </div>
          <div className="flex-1 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tsData} margin={{ top: 16, right: 24, bottom: 24, left: 12 }}>
                <CartesianGrid stroke="#141414" strokeDasharray="3 3" />
                <XAxis
                  dataKey="tenor"
                  stroke="#333"
                  tick={{ fill: "#666", fontSize: 11, fontFamily: "monospace" }}
                  label={{ value: "Tenor", position: "insideBottom", offset: -12, fill: "#444", fontSize: 10 }}
                />
                <YAxis
                  stroke="#333"
                  tick={{ fill: "#666", fontSize: 11, fontFamily: "monospace" }}
                  tickFormatter={(v) => `${(v as number).toFixed(0)}%`}
                  label={{ value: "IV %", angle: -90, position: "insideLeft", fill: "#444", fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0b0b0b",
                    border: "1px solid #1e1e1e",
                    fontSize: 11,
                    fontFamily: "monospace",
                  }}
                  formatter={(v: number) => [`${v.toFixed(2)}%`, "IV"]}
                />
                <Line
                  type="monotone"
                  dataKey="iv"
                  stroke="#ff8c00"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#ff8c00", strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: "#ff8c00" }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ label }: { label: string }) {
  return (
    <div className="px-2 py-0.5 text-[9px] tracking-widest uppercase text-bb-amber border-b border-bb-divider mb-0.5">
      {label}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${accent ?? ""}`}>{value}</span>
    </div>
  );
}
