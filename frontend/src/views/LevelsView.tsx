import { GEXHistoryChart } from "../components/GEXHistoryChart";
import type { GEXProfile, KeyLevel } from "../types";
import { fmtBig, fmtPrice } from "../lib/format";

interface FutsInfo {
  label: string;
  multiplier: number;
  futPrice: number;
}

interface Props {
  levels: KeyLevel[];
  gex: GEXProfile | null;
  spot: number;
  underlying: string;
  futsInfo?: FutsInfo | null;
}

const KIND_HEX: Record<string, string> = {
  gamma_flip:        "#22d3ee",
  call_wall:         "#00d04a",
  put_wall:          "#ff3333",
  magnet:            "#555",
  dealer_support:    "#00d04a",
  dealer_resistance: "#ff3333",
  max_pain:          "#ffd700",
};

const KIND_BG: Record<string, string> = {
  gamma_flip: "rgba(34,211,238,0.04)",
  call_wall:  "rgba(0,208,74,0.04)",
  put_wall:   "rgba(255,51,51,0.04)",
};

export function LevelsView({ levels, gex, spot, underlying, futsInfo }: Props) {
  const sorted = [...levels].sort((a, b) => b.price - a.price);
  const futsSpot = futsInfo ? spot * futsInfo.multiplier : null;

  return (
    <div className="h-full grid grid-cols-12 gap-px overflow-hidden" style={{ background: "#111" }}>

      {/* ── Price ladder ──────────────────────────────────────── */}
      <div className="col-span-12 lg:col-span-7 flex flex-col overflow-hidden" style={{ background: "#080808" }}>
        <div className="panel flex-1 overflow-hidden flex flex-col" style={{ border: "none" }}>
          <div className="panel-hdr">
            <span>Price Ladder · {underlying}</span>
            <div className="flex items-center gap-3">
              {futsInfo && futsSpot && (
                <span
                  className="text-[10px] font-bold tracking-wider"
                  style={{ color: "#ff8c00", textShadow: "0 0 8px rgba(255,140,0,0.6)" }}
                >
                  {futsInfo.label} {futsSpot.toFixed(2)}
                </span>
              )}
              <span className="normal-case font-normal text-[9px]" style={{ color: "#444" }}>
                spot {fmtPrice(spot)}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="bb-table">
              <thead>
                <tr>
                  <th>{futsInfo ? `${futsInfo.label} Price` : "Price"}</th>
                  {futsInfo && <th style={{ color: "#2a2a2a" }}>{underlying}</th>}
                  <th>Δ Spot %</th>
                  <th>Type</th>
                  <th>Strength</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={futsInfo ? 6 : 5} className="text-center py-8" style={{ color: "#333" }}>
                      No levels yet…
                    </td>
                  </tr>
                )}
                {sorted.map((lv) => {
                  const dist    = ((lv.price - spot) / spot) * 100;
                  const isAbove = dist > 0;
                  const isSpot  = Math.abs(dist) < 0.05;
                  const futEquiv = futsInfo ? lv.price * futsInfo.multiplier : null;
                  const kindHex  = KIND_HEX[lv.kind] ?? "#555";
                  return (
                    <tr
                      key={`${lv.kind}-${lv.price}`}
                      style={{ background: isSpot ? "rgba(255,140,0,0.05)" : (KIND_BG[lv.kind] ?? "transparent") }}
                    >
                      {/* Primary price */}
                      <td className="font-mono font-bold">
                        <span style={isSpot
                          ? { color: "#ff8c00", textShadow: "0 0 8px rgba(255,140,0,0.6)" }
                          : { color: "#ccc" }
                        }>
                          {futsInfo && futEquiv != null
                            ? futEquiv.toFixed(0)
                            : fmtPrice(lv.price)}
                        </span>
                        {isSpot && (
                          <span className="ml-1.5 text-[8px] font-bold"
                            style={{ color: "#ff8c00" }}>
                            ← SPOT
                          </span>
                        )}
                      </td>
                      {/* ETF equiv when FUTS on */}
                      {futsInfo && (
                        <td className="font-mono text-[10px]" style={{ color: "#383838" }}>
                          {fmtPrice(lv.price)}
                        </td>
                      )}
                      {/* Distance */}
                      <td className="font-mono font-bold">
                        <span style={{
                          color: isSpot ? "#ff8c00" : isAbove ? "#00d04a" : "#ff3333",
                          textShadow: `0 0 5px currentColor`,
                        }}>
                          {isAbove ? "+" : ""}{dist.toFixed(2)}%
                        </span>
                      </td>
                      {/* Kind label */}
                      <td>
                        <span
                          className="font-bold text-[10px]"
                          style={{ color: kindHex, textShadow: `0 0 6px ${kindHex}50` }}
                        >
                          {lv.label}
                        </span>
                      </td>
                      {/* Strength bar */}
                      <td>
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5" style={{ background: "#111" }}>
                            <div
                              className="h-full"
                              style={{
                                width: `${lv.strength * 100}%`,
                                background: `linear-gradient(90deg, ${kindHex}80, ${kindHex})`,
                                boxShadow: lv.strength > 0.7 ? `0 0 4px ${kindHex}60` : "none",
                              }}
                            />
                          </div>
                          <span className="text-[8px] tabular-nums" style={{ color: "#3a3a3a" }}>
                            {(lv.strength * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      {/* Note */}
                      <td className="max-w-[200px] truncate text-[10px]" style={{ color: "#3a3a3a" }}>
                        {lv.note ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── GEX summary + legend ──────────────────────────────── */}
      <div className="col-span-12 lg:col-span-5 flex flex-col gap-px overflow-y-auto" style={{ background: "#060606" }}>
        {gex && (
          <div className="panel">
            <div className="panel-hdr">Gamma Structure · {underlying}</div>
            <div className="py-1">
              <GlowRow
                label="Dealer State"
                value={gex.dealer_state.replace("_", " ").toUpperCase()}
                hex={gex.dealer_state === "long_gamma" ? "#22d3ee" : gex.dealer_state === "short_gamma" ? "#ff6600" : "#555"}
              />
              <GlowRow label="Total GEX" value={fmtBig(gex.total_gex)} hex={gex.total_gex >= 0 ? "#00d04a" : "#ff3333"} />
              <GlowRow label="Total DEX" value={fmtBig(gex.total_dex)} hex={gex.total_dex >= 0 ? "#00d04a" : "#ff3333"} />
              <GlowRow
                label={futsInfo ? `Gamma Flip (${futsInfo.label})` : "Gamma Flip"}
                value={futsInfo && gex.gamma_flip
                  ? (gex.gamma_flip * futsInfo.multiplier).toFixed(0)
                  : fmtPrice(gex.gamma_flip)}
                hex="#22d3ee"
              />
              <GlowRow
                label={futsInfo ? `Call Wall (${futsInfo.label})` : "Call Wall"}
                value={futsInfo && gex.largest_call_wall
                  ? (gex.largest_call_wall * futsInfo.multiplier).toFixed(0)
                  : fmtPrice(gex.largest_call_wall)}
                hex="#00d04a"
              />
              <GlowRow
                label={futsInfo ? `Put Wall (${futsInfo.label})` : "Put Wall"}
                value={futsInfo && gex.largest_put_wall
                  ? (gex.largest_put_wall * futsInfo.multiplier).toFixed(0)
                  : fmtPrice(gex.largest_put_wall)}
                hex="#ff3333"
              />
            </div>
          </div>
        )}

        <div className="panel" style={{ minHeight: 180 }}>
          <div className="panel-hdr">Level Legend</div>
          <div className="py-2 px-3 space-y-2.5">
            {[
              { kind: "gamma_flip", label: "Gamma Flip", desc: "Dealer gamma sign-change zone — price behavior shifts here" },
              { kind: "call_wall",  label: "Call Wall",  desc: "Largest positive dealer gamma — acts as resistance" },
              { kind: "put_wall",   label: "Put Wall",   desc: "Largest negative dealer gamma — acts as support" },
              { kind: "magnet",     label: "OI Magnet",  desc: "High open-interest strike — price tends to gravitate here" },
              { kind: "max_pain",   label: "Max Pain",   desc: "Strike minimizing total intrinsic value of all open options" },
            ].map((item) => {
              const hex = KIND_HEX[item.kind] ?? "#555";
              return (
                <div key={item.kind} className="flex gap-2 text-[10px]">
                  <span
                    className="font-bold w-20 shrink-0 text-[9px]"
                    style={{ color: hex, textShadow: `0 0 6px ${hex}50` }}
                  >
                    {item.label}
                  </span>
                  <span style={{ color: "#3a3a3a" }}>{item.desc}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Intraday GEX history chart */}
        <div className="flex-1 min-h-0" style={{ minHeight: 240 }}>
          <GEXHistoryChart symbol={underlying} />
        </div>
      </div>
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
