import { useState } from "react";
import type { FlowEvent, FlowSide } from "../types";
import { fmtBig } from "../lib/format";

interface Props {
  events: FlowEvent[];
  underlying: string;
  compact?: boolean;
}

const SIDE_COLOR: Record<FlowSide, string> = {
  bullish: "text-bb-green",
  bearish: "text-bb-red",
  neutral: "text-bb-muted",
};

const TYPE_BORDER: Record<string, string> = {
  block:   "border-bb-yellow text-bb-yellow",
  unusual: "border-bb-orange text-bb-orange",
  large:   "border-bb-cyan text-bb-cyan",
  sweep:   "border-bb-dim text-bb-muted",
};

export function FlowTape({ events, underlying, compact = false }: Props) {
  const [sideFilter, setSideFilter] = useState<FlowSide | "all">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filtered = events.filter((e) => {
    if (sideFilter !== "all" && e.side !== sideFilter) return false;
    if (typeFilter !== "all" && e.event_type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-hdr">
        <span>Flow Tape · {underlying}</span>
        <span className="text-bb-muted normal-case font-normal">{filtered.length} prints</span>
      </div>

      {/* Filters */}
      {!compact && (
        <div className="flex gap-0 border-b border-bb-border bg-bb-header text-[9px] shrink-0">
          {(["all", "bullish", "bearish", "neutral"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSideFilter(s)}
              className={[
                "px-2 py-1 uppercase tracking-wider border-r border-bb-border transition-colors",
                sideFilter === s
                  ? s === "all" ? "bg-bb-amber text-black font-bold"
                    : s === "bullish" ? "bg-bb-green text-black font-bold"
                    : s === "bearish" ? "bg-bb-red text-black font-bold"
                    : "bg-bb-dim text-bb-text font-bold"
                  : "text-bb-muted hover:text-bb-text",
              ].join(" ")}
            >
              {s}
            </button>
          ))}
          <div className="flex-1" />
          {(["all", "block", "unusual", "large", "sweep"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={[
                "px-2 py-1 uppercase tracking-wider border-l border-bb-border transition-colors",
                typeFilter === t ? "text-bb-amber font-bold" : "text-bb-muted hover:text-bb-text",
              ].join(" ")}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <table className="bb-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Side</th>
              <th>Type</th>
              <th className="text-right">Strike</th>
              <th>Exp</th>
              <th className="text-right">Size</th>
              <th className="text-right">Prem</th>
              {!compact && <th className="text-right">IV</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={compact ? 7 : 8}
                  className="text-center text-bb-muted py-6"
                >
                  {events.length === 0 ? "Waiting for flow…" : "No prints match filters."}
                </td>
              </tr>
            )}
            {filtered.map((e) => (
              <tr key={e.id}>
                <td className="text-bb-muted">
                  {new Date(e.timestamp).toLocaleTimeString("en-US", { hour12: false })}
                </td>
                <td className={`font-bold ${SIDE_COLOR[e.side]}`}>
                  {e.side.slice(0, 4).toUpperCase()}
                </td>
                <td>
                  <span className={`badge border ${TYPE_BORDER[e.event_type] ?? "border-bb-dim text-bb-muted"}`}>
                    {e.event_type}
                  </span>
                </td>
                <td className="text-right font-mono">
                  {e.strike.toFixed(0)}
                  <span
                    className={`ml-1 text-[9px] ${
                      e.option_type === "call" ? "text-bb-green" : "text-bb-red"
                    }`}
                  >
                    {e.option_type === "call" ? "C" : "P"}
                  </span>
                </td>
                <td className="text-bb-muted">{e.expiration.slice(5)}</td>
                <td className="text-right font-mono">{e.size.toLocaleString()}</td>
                <td className="text-right font-mono text-bb-amber">${fmtBig(e.premium)}</td>
                {!compact && (
                  <td className="text-right text-bb-muted">
                    {e.iv ? `${(e.iv * 100).toFixed(0)}%` : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
