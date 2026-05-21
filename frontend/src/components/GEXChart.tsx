import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GEXProfile } from "../types";
import { fmtBig, fmtPrice } from "../lib/format";

interface Props {
  profile: GEXProfile | null;
}

export function GEXChart({ profile }: Props) {
  if (!profile) {
    return (
      <div className="panel">
        <div className="panel-title">Gamma Exposure</div>
        <div className="text-zinc-500 text-sm">No data yet…</div>
      </div>
    );
  }

  // Restrict to strikes within ±10% of spot for readability
  const spot = profile.underlying_price;
  const minK = spot * 0.9;
  const maxK = spot * 1.1;
  const data = profile.levels
    .filter((l) => l.strike >= minK && l.strike <= maxK)
    .map((l) => ({
      strike: l.strike,
      net: l.net_gex,
      call: l.call_gex,
      put: l.put_gex,
    }));

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-title">
        <span>
          Gamma Exposure · {profile.underlying}{" "}
          <span
            className={
              profile.dealer_state === "long_gamma"
                ? "text-cyan-300"
                : profile.dealer_state === "short_gamma"
                ? "text-orange-300"
                : "text-zinc-400"
            }
          >
            {profile.dealer_state.replace("_", " ")}
          </span>
        </span>
        <span className="text-zinc-500 normal-case">
          total {fmtBig(profile.total_gex)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px] mb-2">
        <Stat label="Gamma Flip" value={fmtPrice(profile.gamma_flip)} />
        <Stat
          label="Call Wall"
          value={fmtPrice(profile.largest_call_wall)}
          accent="text-emerald-400"
        />
        <Stat
          label="Put Wall"
          value={fmtPrice(profile.largest_put_wall)}
          accent="text-rose-400"
        />
      </div>

      <div className="flex-1 min-h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
            <XAxis
              type="number"
              stroke="#71717a"
              fontSize={10}
              tickFormatter={(v) => fmtBig(v as number)}
            />
            <YAxis
              type="category"
              dataKey="strike"
              stroke="#71717a"
              fontSize={10}
              width={50}
              tickFormatter={(v) => (v as number).toFixed(0)}
              reversed
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#111114",
                border: "1px solid #27272a",
                fontSize: 11,
              }}
              formatter={(v: number) => fmtBig(v)}
              labelFormatter={(v) => `Strike ${v}`}
            />
            <ReferenceLine
              y={
                data.find(
                  (d) => Math.abs(d.strike - spot) === Math.min(...data.map((d) => Math.abs(d.strike - spot)))
                )?.strike
              }
              stroke="#22d3ee"
              strokeDasharray="2 2"
              label={{
                value: `spot ${spot.toFixed(2)}`,
                position: "right",
                fill: "#22d3ee",
                fontSize: 10,
              }}
            />
            <Bar dataKey="net">
              {data.map((row) => (
                <Cell
                  key={row.strike}
                  fill={row.net >= 0 ? "#22c55e" : "#ef4444"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded border border-terminal-border bg-zinc-900/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className={`font-semibold ${accent ?? "text-zinc-200"}`}>
        {value}
      </div>
    </div>
  );
}
