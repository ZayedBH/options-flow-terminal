import type { GEXProfile, KeyLevel } from "../types";
import { fmtBig, fmtPrice } from "../lib/format";

interface Props {
  levels: KeyLevel[];
  gex: GEXProfile | null;
  spot: number;
  underlying: string;
}

const KIND_COLOR: Record<string, string> = {
  gamma_flip:        "text-bb-cyan",
  call_wall:         "text-bb-green",
  put_wall:          "text-bb-red",
  magnet:            "text-bb-muted",
  dealer_support:    "text-bb-green",
  dealer_resistance: "text-bb-red",
};

const KIND_BG: Record<string, string> = {
  gamma_flip:  "bg-[#00bcd420]",
  call_wall:   "bg-[#00d04a18]",
  put_wall:    "bg-[#ff333318]",
};

export function LevelsView({ levels, gex, spot, underlying }: Props) {
  const sorted = [...levels].sort((a, b) => b.price - a.price);

  return (
    <div className="h-full grid grid-cols-12 gap-px bg-bb-border overflow-hidden">
      {/* Price ladder */}
      <div className="col-span-12 lg:col-span-7 flex flex-col overflow-hidden">
        <div className="panel flex-1 overflow-hidden flex flex-col">
          <div className="panel-hdr">
            <span>Price Ladder · {underlying}</span>
            <span className="text-bb-muted font-normal normal-case">spot {fmtPrice(spot)}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="bb-table">
              <thead>
                <tr>
                  <th>Price</th>
                  <th>Δ Spot %</th>
                  <th>Type</th>
                  <th>Strength</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-bb-muted py-8">
                      No levels yet…
                    </td>
                  </tr>
                )}
                {sorted.map((lv) => {
                  const dist = ((lv.price - spot) / spot) * 100;
                  const isAbove = dist > 0;
                  const isSpot = Math.abs(dist) < 0.05;
                  return (
                    <tr
                      key={`${lv.kind}-${lv.price}`}
                      className={KIND_BG[lv.kind] ?? ""}
                    >
                      <td className={`font-mono font-bold ${isSpot ? "text-bb-amber" : "text-bb-text"}`}>
                        {fmtPrice(lv.price)}
                        {isSpot && <span className="ml-1 text-[9px] text-bb-amber">← SPOT</span>}
                      </td>
                      <td className={`font-mono ${isAbove ? "text-bb-green" : "text-bb-red"}`}>
                        {isAbove ? "+" : ""}
                        {dist.toFixed(2)}%
                      </td>
                      <td className={`font-bold ${KIND_COLOR[lv.kind] ?? "text-bb-muted"}`}>
                        {lv.label}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1 bg-bb-border">
                            <div
                              className="h-full bg-bb-amber"
                              style={{ width: `${lv.strength * 100}%` }}
                            />
                          </div>
                          <span className="text-bb-muted text-[9px]">
                            {(lv.strength * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="text-bb-muted text-[10px] max-w-[200px] truncate">
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

      {/* GEX summary sidebar */}
      <div className="col-span-12 lg:col-span-5 flex flex-col gap-px bg-bb-border overflow-y-auto">
        {gex && (
          <div className="panel">
            <div className="panel-hdr">Gamma Structure · {underlying}</div>
            <div className="py-1">
              <Row label="Dealer State" value={gex.dealer_state.replace("_", " ").toUpperCase()} />
              <Row label="Total GEX" value={fmtBig(gex.total_gex)} />
              <Row label="Total DEX" value={fmtBig(gex.total_dex)} />
              <Row label="Gamma Flip" value={fmtPrice(gex.gamma_flip)} accent="text-bb-cyan" />
              <Row label="Call Wall" value={fmtPrice(gex.largest_call_wall)} accent="text-bb-green" />
              <Row label="Put Wall" value={fmtPrice(gex.largest_put_wall)} accent="text-bb-red" />
            </div>
          </div>
        )}

        <div className="panel flex-1">
          <div className="panel-hdr">Level Legend</div>
          <div className="py-2 px-2 space-y-2">
            {[
              { kind: "gamma_flip", label: "Gamma Flip", desc: "Dealer gamma sign-change zone — price behavior shifts here" },
              { kind: "call_wall", label: "Call Wall", desc: "Largest positive dealer gamma — acts as resistance" },
              { kind: "put_wall", label: "Put Wall", desc: "Largest negative dealer gamma — acts as support" },
              { kind: "magnet", label: "OI Magnet", desc: "High open-interest strike — price tends to gravitate here" },
            ].map((item) => (
              <div key={item.kind} className="flex gap-2 text-[10px]">
                <span className={`font-bold w-20 shrink-0 ${KIND_COLOR[item.kind]}`}>
                  {item.label}
                </span>
                <span className="text-bb-muted">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
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
