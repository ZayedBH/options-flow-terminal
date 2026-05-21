import clsx from "clsx";
import type { KeyLevel } from "../types";
import { fmtPrice } from "../lib/format";

interface Props {
  levels: KeyLevel[];
  spot: number;
}

const KIND_COLOR: Record<string, string> = {
  gamma_flip: "text-cyan-300",
  call_wall: "text-emerald-400",
  put_wall: "text-rose-400",
  magnet: "text-zinc-300",
  dealer_support: "text-emerald-300",
  dealer_resistance: "text-rose-300",
};

export function KeyLevelsPanel({ levels, spot }: Props) {
  const sorted = [...levels].sort((a, b) => b.price - a.price);
  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-title">
        <span>Key Levels</span>
        <span className="text-zinc-500 normal-case">{sorted.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-[11px] font-mono">
          <thead className="text-zinc-500 text-left">
            <tr>
              <th className="py-1 font-normal">Price</th>
              <th className="py-1 font-normal">Δ%</th>
              <th className="py-1 font-normal">Type</th>
              <th className="py-1 font-normal">Note</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((lv) => {
              const dist = ((lv.price - spot) / spot) * 100;
              return (
                <tr
                  key={`${lv.kind}-${lv.price}`}
                  className="border-t border-terminal-border hover:bg-zinc-900/40"
                >
                  <td className="py-1 font-semibold">{fmtPrice(lv.price)}</td>
                  <td
                    className={clsx(
                      "py-1",
                      dist > 0 ? "text-emerald-400" : "text-rose-400"
                    )}
                  >
                    {dist > 0 ? "+" : ""}
                    {dist.toFixed(2)}%
                  </td>
                  <td
                    className={clsx(
                      "py-1 font-semibold",
                      KIND_COLOR[lv.kind] ?? "text-zinc-300"
                    )}
                  >
                    {lv.label}
                  </td>
                  <td className="py-1 text-zinc-500 truncate max-w-[180px]">
                    {lv.note ?? ""}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-center text-zinc-500">
                  No levels yet…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
