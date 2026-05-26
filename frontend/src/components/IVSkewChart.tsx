/**
 * IV Skew / Smile Chart
 * Shows call IV and put IV by strike for a selected expiry.
 * Rendered as two lines (calls = green, puts = red) with spot marked.
 */
import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IVSummary } from "../types";

interface Props {
  iv: IVSummary;
  spot: number;
}

export function IVSkewChart({ iv, spot }: Props) {
  const expiries = Object.keys(iv.skew_by_expiry ?? {});
  const [selectedExpiry, setSelectedExpiry] = useState<string>(expiries[0] ?? "");

  if (!expiries.length) {
    return (
      <div className="panel h-full">
        <div className="panel-hdr">IV Skew Curve</div>
        <div className="px-3 py-3 text-bb-muted text-xs">No skew data yet…</div>
      </div>
    );
  }

  // Keep selectedExpiry valid when expiries list changes
  const activeExpiry = expiries.includes(selectedExpiry) ? selectedExpiry : expiries[0];
  const points = iv.skew_by_expiry[activeExpiry] ?? [];

  const data = points.map((p) => ({
    strike: p.strike,
    call: p.call_iv != null ? +(p.call_iv * 100).toFixed(2) : null,
    put: p.put_iv != null ? +(p.put_iv * 100).toFixed(2) : null,
  }));

  // Spot reference line — find nearest strike in dataset
  const nearestStrike = data.reduce(
    (best, d) => Math.abs(d.strike - spot) < Math.abs(best.strike - spot) ? d : best,
    data[0],
  )?.strike;

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-hdr">
        <span>IV Skew Curve · {iv.underlying}</span>
        <div className="flex items-center gap-px">
          {expiries.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setSelectedExpiry(ex)}
              className="px-3 py-0.5 text-[9px] font-bold tracking-wider transition-all"
              style={
                ex === activeExpiry
                  ? {
                      color: "#ff8c00",
                      background: "rgba(255,140,0,0.1)",
                      borderBottom: "2px solid #ff8c00",
                      textShadow: "0 0 8px rgba(255,140,0,0.6)",
                    }
                  : { color: "#3a3a3a", borderBottom: "2px solid transparent" }
              }
            >
              {ex.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3" style={{ borderBottom: "1px solid #111" }}>
        <SkewCell label="ATM IV" value={iv.atm_iv != null ? `${(iv.atm_iv * 100).toFixed(1)}%` : "—"} hex="#ff8c00" />
        <SkewCell
          label="25Δ SKEW"
          value={iv.skew_25d != null ? `${(iv.skew_25d * 100).toFixed(1)}%` : "—"}
          hex={iv.skew_25d != null && iv.skew_25d > 0 ? "#ff3333" : "#00d04a"}
          border
        />
        <SkewCell
          label="VOL STATE"
          value={iv.state.toUpperCase()}
          hex={
            iv.state === "expansion" ? "#ff6600" :
            iv.state === "compression" ? "#22d3ee" :
            iv.state === "crush" ? "#ff3333" : "#666"
          }
          border
        />
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 p-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ left: 4, right: 12, top: 8, bottom: 4 }}
          >
            <CartesianGrid stroke="#0f0f0f" strokeDasharray="2 2" />
            <XAxis
              dataKey="strike"
              type="number"
              domain={["dataMin", "dataMax"]}
              stroke="#1a1a1a"
              fontSize={8}
              tick={{ fill: "#555" }}
              tickFormatter={(v: number) => v.toFixed(0)}
              axisLine={false}
            />
            <YAxis
              stroke="#1a1a1a"
              fontSize={8}
              tick={{ fill: "#555" }}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              axisLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#060606",
                border: "1px solid #1a1a1a",
                fontSize: 10,
                fontFamily: "monospace",
                color: "#e0e0e0",
              }}
              labelStyle={{ color: "#ff8c00", fontWeight: "bold" }}
              labelFormatter={(v) => `Strike ${v}`}
              formatter={(v: number, name: string) => [
                `${v.toFixed(2)}%`,
                name === "call" ? "Call IV" : "Put IV",
              ]}
              cursor={{ stroke: "#222" }}
            />
            <Legend
              wrapperStyle={{ fontSize: 9, color: "#555" }}
              formatter={(value) => value === "call" ? "Call IV" : "Put IV"}
            />
            {nearestStrike != null && (
              <ReferenceLine
                x={nearestStrike}
                stroke="#ff8c00"
                strokeDasharray="3 2"
                strokeWidth={1}
                label={{
                  value: `spot ${spot.toFixed(0)}`,
                  position: "top",
                  fill: "#ff8c00",
                  fontSize: 8,
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="call"
              stroke="#00d04a"
              strokeWidth={1.5}
              dot={false}
              connectNulls
              style={{ filter: "drop-shadow(0 0 4px rgba(0,208,74,0.4))" }}
            />
            <Line
              type="monotone"
              dataKey="put"
              stroke="#ff3333"
              strokeWidth={1.5}
              dot={false}
              connectNulls
              style={{ filter: "drop-shadow(0 0 4px rgba(255,51,51,0.4))" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SkewCell({
  label,
  value,
  hex,
  border,
}: {
  label: string;
  value: string;
  hex: string;
  border?: boolean;
}) {
  return (
    <div
      className={`px-3 py-2 ${border ? "border-l" : ""}`}
      style={{
        borderColor: "#111",
        background: `linear-gradient(180deg, ${hex}06 0%, transparent 100%)`,
      }}
    >
      <div className="text-[8px] tracking-widest uppercase mb-0.5" style={{ color: "#333" }}>
        {label}
      </div>
      <div
        className="font-mono font-bold text-xs"
        style={{ color: hex, textShadow: `0 0 8px ${hex}60` }}
      >
        {value}
      </div>
    </div>
  );
}
