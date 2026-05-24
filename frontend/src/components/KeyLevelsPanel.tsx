import type { KeyLevel } from "../types";
import { fmtPrice } from "../lib/format";

interface Props {
  levels: KeyLevel[];
  spot: number;
}

const KIND_COLOR: Record<string, string> = {
  gamma_flip:        "text-bb-cyan",
  call_wall:         "text-bb-green",
  put_wall:          "text-bb-red",
  magnet:            "text-bb-muted",
  dealer_support:    "text-bb-green",
  dealer_resistance: "text-bb-red",
};

export function KeyLevelsPanel({ levels, spot }: Props) {
  const sorted = [...levels].sort((a, b) => b.price - a.price);

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-hdr">
        <span>Key Levels</span>
        <span className="text-bb-muted normal-case font-normal">{sorted.length} levels</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="bb-table">
          <thead>
            <tr>
              <th>Price</th>
              <th>Δ%</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-bb-muted py-6">
                  No levels yet…
                </td>
              </tr>
            )}
            {sorted.map((lv) => {
              const dist = ((lv.price - spot) / spot) * 100;
              const isAbove = dist > 0;
              return (
                <tr key={`${lv.kind}-${lv.price}`}>
                  <td className="font-mono font-bold text-bb-text">
                    {fmtPrice(lv.price)}
                  </td>
                  <td className={`font-mono ${isAbove ? "text-bb-green" : "text-bb-red"}`}>
                    {isAbove ? "+" : ""}
                    {dist.toFixed(2)}%
                  </td>
                  <td className={`font-bold ${KIND_COLOR[lv.kind] ?? "text-bb-muted"}`}>
                    {lv.label}
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
