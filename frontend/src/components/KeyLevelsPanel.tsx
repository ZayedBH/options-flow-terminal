import type { KeyLevel } from "../types";
import { fmtPrice } from "../lib/format";

interface FutsInfo {
  label: string;
  multiplier: number;
  futPrice: number;
}

interface Props {
  levels: KeyLevel[];
  spot: number;
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

export function KeyLevelsPanel({ levels, spot, futsInfo }: Props) {
  const sorted = [...levels].sort((a, b) => b.price - a.price);

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-hdr">
        <span>Key Levels{futsInfo ? ` · ${futsInfo.label}` : ""}</span>
        <span className="normal-case font-normal text-[9px]" style={{ color: "#333" }}>
          {sorted.length} levels
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="bb-table">
          <thead>
            <tr>
              <th>{futsInfo ? `${futsInfo.label} Price` : "Price"}</th>
              {futsInfo && <th>ETF</th>}
              <th>Δ%</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={futsInfo ? 4 : 3} className="text-center py-6" style={{ color: "#333" }}>
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
                <tr key={`${lv.kind}-${lv.price}`}
                  style={isSpot ? { background: "rgba(255,140,0,0.04)" } : undefined}>
                  <td className="font-mono font-bold">
                    <span style={isSpot
                      ? { color: "#ff8c00", textShadow: "0 0 8px rgba(255,140,0,0.6)" }
                      : { color: "#ccc" }
                    }>
                      {futEquiv != null ? futEquiv.toFixed(0) : fmtPrice(lv.price)}
                    </span>
                  </td>
                  {futsInfo && (
                    <td className="font-mono text-[10px]" style={{ color: "#333" }}>
                      {fmtPrice(lv.price)}
                    </td>
                  )}
                  <td className="font-mono font-bold">
                    <span style={{
                      color: isSpot ? "#ff8c00" : isAbove ? "#00d04a" : "#ff3333",
                    }}>
                      {isAbove ? "+" : ""}{dist.toFixed(2)}%
                    </span>
                  </td>
                  <td>
                    <span
                      className="font-bold text-[10px]"
                      style={{ color: kindHex, textShadow: `0 0 5px ${kindHex}50` }}
                    >
                      {lv.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
