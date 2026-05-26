/**
 * Intraday GEX History Chart
 * Displays total_gex and gamma_flip over an 8-hour rolling window.
 * Uses a useEffect poll against /history/{symbol} every 60 seconds.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchGEXHistory } from "../api/client";
import { fmtBig } from "../lib/format";
import type { GEXHistoryPoint } from "../types";

interface Props {
  symbol: string;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso.slice(11, 16);
  }
}

export function GEXHistoryChart({ symbol }: Props) {
  const [history, setHistory] = useState<GEXHistoryPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchGEXHistory(symbol);
      setHistory(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch error");
    }
  }, [symbol]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  const data = history.map((p) => ({
    time: fmtTime(p.ts),
    gex: +(p.total_gex / 1e6).toFixed(2),       // in $M
    flip: p.gamma_flip ?? undefined,
    state: p.dealer_state,
  }));

  // Determine if we're currently long or short gamma for accent color
  const lastState = history.at(-1)?.dealer_state ?? "unknown";
  const stateHex =
    lastState === "long_gamma"  ? "#22d3ee" :
    lastState === "short_gamma" ? "#ff6600" : "#666";

  // Decide how many x-axis ticks to show (every ~30 points)
  const tickInterval = Math.max(1, Math.floor(data.length / 8));

  if (!history.length && !error) {
    return (
      <div className="panel h-full">
        <div className="panel-hdr">Intraday GEX History</div>
        <div className="px-3 py-3 text-bb-muted text-xs">
          Collecting data… chart appears after first poll cycle.
        </div>
      </div>
    );
  }

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-hdr">
        <span>
          Intraday GEX · {symbol}{" "}
          {lastState !== "unknown" && (
            <span style={{ color: stateHex, textShadow: `0 0 8px ${stateHex}60` }}>
              [{lastState.replace("_", " ").toUpperCase()}]
            </span>
          )}
        </span>
        <span className="text-[9px]" style={{ color: "#333" }}>
          {data.length} pts · 8h window
        </span>
      </div>

      {error && (
        <div className="px-3 py-1 text-[9px]" style={{ color: "#ff3333" }}>
          {error}
        </div>
      )}

      {/* Summary strip */}
      {history.length > 0 && (() => {
        const first = history[0].total_gex;
        const last = history.at(-1)!.total_gex;
        const change = last - first;
        const changeHex = change >= 0 ? "#00d04a" : "#ff3333";
        const latestFlip = history.at(-1)?.gamma_flip;
        return (
          <div className="grid grid-cols-3" style={{ borderBottom: "1px solid #111" }}>
            <GexCell label="CURRENT GEX" value={fmtBig(last)} hex="#ff8c00" />
            <GexCell
              label="INTRADAY Δ"
              value={`${change >= 0 ? "+" : ""}${fmtBig(change)}`}
              hex={changeHex}
              border
            />
            <GexCell
              label="GAMMA FLIP"
              value={latestFlip != null ? latestFlip.toFixed(0) : "—"}
              hex="#22d3ee"
              border
            />
          </div>
        );
      })()}

      {/* Chart */}
      <div className="flex-1 min-h-0 p-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
            <CartesianGrid stroke="#0f0f0f" strokeDasharray="2 2" />
            <XAxis
              dataKey="time"
              stroke="#1a1a1a"
              fontSize={8}
              tick={{ fill: "#555" }}
              interval={tickInterval}
              axisLine={false}
            />
            {/* Left axis: net GEX in $M */}
            <YAxis
              yAxisId="gex"
              stroke="#1a1a1a"
              fontSize={8}
              tick={{ fill: "#555" }}
              tickFormatter={(v: number) => `${v}M`}
              axisLine={false}
              width={40}
            />
            {/* Right axis: gamma flip price */}
            <YAxis
              yAxisId="flip"
              orientation="right"
              stroke="#1a1a1a"
              fontSize={8}
              tick={{ fill: "#22d3ee" }}
              tickFormatter={(v: number) => v.toFixed(0)}
              axisLine={false}
              width={48}
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
              formatter={(v: number, name: string) => {
                if (name === "gex") return [`$${v}M`, "Net GEX"];
                if (name === "flip") return [v.toFixed(0), "Gamma Flip"];
                return [v, name];
              }}
              cursor={{ stroke: "#222" }}
            />
            <Legend
              wrapperStyle={{ fontSize: 9, color: "#555" }}
              formatter={(value) =>
                value === "gex" ? "Net GEX ($M)" : "Gamma Flip"
              }
            />
            {/* Zero line for GEX */}
            <ReferenceLine yAxisId="gex" y={0} stroke="#222" strokeDasharray="3 2" />
            <Line
              yAxisId="gex"
              type="monotone"
              dataKey="gex"
              stroke="#ff8c00"
              strokeWidth={1.5}
              dot={false}
              connectNulls
              style={{ filter: "drop-shadow(0 0 4px rgba(255,140,0,0.4))" }}
            />
            <Line
              yAxisId="flip"
              type="monotone"
              dataKey="flip"
              stroke="#22d3ee"
              strokeWidth={1}
              dot={false}
              strokeDasharray="4 2"
              connectNulls
              style={{ filter: "drop-shadow(0 0 4px rgba(34,211,238,0.3))" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function GexCell({
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
