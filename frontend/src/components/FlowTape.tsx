import clsx from "clsx";
import type { FlowEvent } from "../types";
import { fmtBig, sideColor } from "../lib/format";

interface Props {
  events: FlowEvent[];
  underlying: string;
}

export function FlowTape({ events, underlying }: Props) {
  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-title">
        <span>Options Flow Tape · {underlying}</span>
        <span className="text-zinc-500 normal-case">{events.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto -mx-3">
        <table className="w-full text-[11px] font-mono">
          <thead className="sticky top-0 bg-terminal-panel z-10">
            <tr className="text-zinc-500 text-left">
              <th className="px-3 py-1.5 font-normal">Time</th>
              <th className="px-3 py-1.5 font-normal">Side</th>
              <th className="px-3 py-1.5 font-normal">Type</th>
              <th className="px-3 py-1.5 font-normal text-right">Strike</th>
              <th className="px-3 py-1.5 font-normal">Exp</th>
              <th className="px-3 py-1.5 font-normal text-right">Size</th>
              <th className="px-3 py-1.5 font-normal text-right">Prem</th>
              <th className="px-3 py-1.5 font-normal text-right">IV</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-4 text-zinc-500 text-center"
                >
                  Waiting for flow…
                </td>
              </tr>
            )}
            {events.map((e) => (
              <tr
                key={e.id}
                className="border-t border-terminal-border hover:bg-zinc-900/40"
              >
                <td className="px-3 py-1 text-zinc-500">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </td>
                <td className={clsx("px-3 py-1 font-semibold", sideColor(e.side))}>
                  {e.side.toUpperCase()}
                </td>
                <td className="px-3 py-1">
                  <span className="pill bg-zinc-800 text-zinc-300">
                    {e.event_type}
                  </span>
                </td>
                <td className="px-3 py-1 text-right">
                  {e.strike.toFixed(0)}
                  <span
                    className={clsx(
                      "ml-1 text-[10px]",
                      e.option_type === "call"
                        ? "text-emerald-400"
                        : "text-rose-400"
                    )}
                  >
                    {e.option_type === "call" ? "C" : "P"}
                  </span>
                </td>
                <td className="px-3 py-1 text-zinc-400">
                  {e.expiration.slice(5)}
                </td>
                <td className="px-3 py-1 text-right">{e.size.toLocaleString()}</td>
                <td className="px-3 py-1 text-right">${fmtBig(e.premium)}</td>
                <td className="px-3 py-1 text-right text-zinc-400">
                  {e.iv ? `${(e.iv * 100).toFixed(0)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
