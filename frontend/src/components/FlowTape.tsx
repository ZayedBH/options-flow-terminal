import { useMemo, useState } from "react";
import type { FlowEvent, FlowSide } from "../types";
import { fmtBig } from "../lib/format";

interface Props {
  events: FlowEvent[];
  underlying: string;
  compact?: boolean;
}

type ExpiryFilter = "all" | "0dte" | "1dte";

function todayStr()    { return new Date().toISOString().slice(0, 10); }
function tomorrowStr() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const SIDE_HEX: Record<FlowSide, string> = {
  bullish: "#00d04a",
  bearish: "#ff3333",
  neutral: "#555",
};

const TYPE_HEX: Record<string, string> = {
  block:   "#ffd700",
  unusual: "#ff6600",
  large:   "#22d3ee",
  sweep:   "#444",
};

function FilterBtn({
  label, active, hex, onClick,
}: { label: string; active: boolean; hex: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2.5 py-1 text-[9px] font-bold tracking-wider uppercase transition-all"
      style={active ? {
        color: hex,
        background: `${hex}15`,
        borderBottom: `2px solid ${hex}`,
        textShadow: `0 0 8px ${hex}80`,
      } : {
        color: "#333",
        borderBottom: "2px solid transparent",
      }}
    >
      {label}
    </button>
  );
}

export function FlowTape({ events, underlying, compact = false }: Props) {
  const [sideFilter, setSideFilter]     = useState<FlowSide | "all">("all");
  const [typeFilter, setTypeFilter]     = useState<string>("all");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("all");

  const filtered = useMemo(() => {
    const today    = todayStr();
    const tomorrow = tomorrowStr();
    return events.filter((e) => {
      if (sideFilter !== "all" && e.side !== sideFilter) return false;
      if (typeFilter !== "all" && e.event_type !== typeFilter) return false;
      if (expiryFilter === "0dte" && e.expiration !== today) return false;
      if (expiryFilter === "1dte" && e.expiration !== tomorrow) return false;
      return true;
    });
  }, [events, sideFilter, typeFilter, expiryFilter]);

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-hdr">
        <span>Flow Tape · {underlying}</span>
        <span className="normal-case font-normal text-[9px]" style={{ color: "#444" }}>
          {filtered.length} prints
        </span>
      </div>

      {/* Filters */}
      {!compact && (
        <div className="flex flex-col shrink-0" style={{ borderBottom: "1px solid #111", background: "#050505" }}>
          {/* Row 1: side + type */}
          <div className="flex items-center" style={{ borderBottom: "1px solid #0d0d0d" }}>
            <FilterBtn label="ALL"     active={sideFilter === "all"}     hex="#ff8c00" onClick={() => setSideFilter("all")} />
            <FilterBtn label="BULL"    active={sideFilter === "bullish"} hex="#00d04a" onClick={() => setSideFilter("bullish")} />
            <FilterBtn label="BEAR"    active={sideFilter === "bearish"} hex="#ff3333" onClick={() => setSideFilter("bearish")} />
            <FilterBtn label="NEUTRAL" active={sideFilter === "neutral"} hex="#555"    onClick={() => setSideFilter("neutral")} />
            <div className="flex-1" />
            <div className="w-px h-4 mx-1" style={{ background: "#1a1a1a" }} />
            {(["all", "block", "unusual", "large", "sweep"] as const).map((t) => (
              <FilterBtn
                key={t}
                label={t.toUpperCase()}
                active={typeFilter === t}
                hex={t === "all" ? "#ff8c00" : TYPE_HEX[t] ?? "#555"}
                onClick={() => setTypeFilter(t)}
              />
            ))}
          </div>
          {/* Row 2: expiry */}
          <div className="flex items-center gap-1 px-2 py-1">
            <span className="text-[8px] tracking-widest uppercase mr-1" style={{ color: "#2a2a2a" }}>EXP</span>
            {(["all", "0dte", "1dte"] as const).map((ex) => (
              <FilterBtn
                key={ex}
                label={ex === "all" ? "ALL" : ex.toUpperCase()}
                active={expiryFilter === ex}
                hex={ex === "0dte" ? "#ff3333" : ex === "1dte" ? "#ff6600" : "#ff8c00"}
                onClick={() => setExpiryFilter(ex)}
              />
            ))}
          </div>
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
                <td colSpan={compact ? 7 : 8} className="text-center py-8" style={{ color: "#333" }}>
                  {events.length === 0 ? "Waiting for flow…" : "No prints match filters."}
                </td>
              </tr>
            )}
            {filtered.map((e) => {
              const sideHex = SIDE_HEX[e.side];
              const typeHex = TYPE_HEX[e.event_type] ?? "#444";
              const isToday    = e.expiration === todayStr();
              const isTomorrow = e.expiration === tomorrowStr();
              return (
                <tr key={e.id}>
                  <td style={{ color: "#444" }}>
                    {new Date(e.timestamp).toLocaleTimeString("en-US", { hour12: false })}
                  </td>
                  <td>
                    <span
                      className="font-bold text-[10px]"
                      style={{ color: sideHex, textShadow: `0 0 6px ${sideHex}60` }}
                    >
                      {e.side.slice(0, 4).toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        color: typeHex,
                        borderColor: `${typeHex}50`,
                        background: `${typeHex}0d`,
                        boxShadow: `0 0 4px ${typeHex}20`,
                      }}
                    >
                      {e.event_type}
                    </span>
                  </td>
                  <td className="text-right font-mono">
                    <span style={{ color: "#ccc" }}>{e.strike.toFixed(0)}</span>
                    <span
                      className="ml-1 text-[9px] font-bold"
                      style={{
                        color: e.option_type === "call" ? "#00d04a" : "#ff3333",
                        textShadow: `0 0 4px currentColor`,
                      }}
                    >
                      {e.option_type === "call" ? "C" : "P"}
                    </span>
                  </td>
                  <td
                    className="font-mono text-[10px] font-bold"
                    style={{
                      color: isToday ? "#ff3333" : isTomorrow ? "#ff6600" : "#444",
                      textShadow: isToday ? "0 0 6px #ff333360" : "none",
                    }}
                  >
                    {e.expiration.slice(5)}
                    {isToday    && <span className="ml-1 text-[8px]">0DTE</span>}
                    {isTomorrow && <span className="ml-1 text-[8px]">1DTE</span>}
                  </td>
                  <td className="text-right font-mono" style={{ color: "#888" }}>
                    {e.size.toLocaleString()}
                  </td>
                  <td className="text-right font-mono font-bold">
                    <span style={{ color: "#ff8c00", textShadow: "0 0 6px rgba(255,140,0,0.5)" }}>
                      ${fmtBig(e.premium)}
                    </span>
                  </td>
                  {!compact && (
                    <td className="text-right" style={{ color: "#444" }}>
                      {e.iv ? `${(e.iv * 100).toFixed(0)}%` : "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
