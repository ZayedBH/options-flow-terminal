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
      <div className="panel h-full">
        <div className="panel-hdr">Gamma Exposure</div>
        <div className="px-2 py-3 text-bb-muted text-xs">No data yet…</div>
      </div>
    );
  }

  const spot = profile.underlying_price;
  const minK = spot * 0.9;
  const maxK = spot * 1.1;
  const data = profile.levels
    .filter((l) => l.strike >= minK && l.strike <= maxK)
    .map((l) => ({
      strike: l.strike,
      net: l.net_gex,
      label: l.strike.toFixed(0),
    }));

  const nearestStrike = data.reduce(
    (best, d) =>
      Math.abs(d.strike - spot) < Math.abs(best.strike - spot) ? d : best,
    data[0],
  )?.strike;

  const stateColor =
    profile.dealer_state === "long_gamma"
      ? "#22d3ee"
      : profile.dealer_state === "short_gamma"
      ? "#ff6600"
      : "#666666";

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-hdr">
        <span>
          Gamma Exposure · {profile.underlying}{" "}
          <span style={{ color: stateColor }}>
            [{profile.dealer_state.replace("_", " ").toUpperCase()}]
          </span>
        </span>
        <span className="text-bb-muted normal-case font-normal font-mono">
          total {fmtBig(profile.total_gex)}
        </span>
      </div>

      {/* Key levels row */}
      <div className="grid grid-cols-3 border-b border-bb-border text-[10px]">
        <LevelCell label="GAMMA FLIP" value={fmtPrice(profile.gamma_flip)} color="#22d3ee" />
        <LevelCell label="CALL WALL" value={fmtPrice(profile.largest_call_wall)} color="#00d04a" border />
        <LevelCell label="PUT WALL" value={fmtPrice(profile.largest_put_wall)} color="#ff3333" border />
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-[200px] p-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
            <CartesianGrid stroke="#141414" strokeDasharray="2 2" horizontal={false} />
            <XAxis
              type="number"
              stroke="#333"
              fontSize={9}
              tick={{ fill: "#555" }}
              tickFormatter={(v) => fmtBig(v as number)}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              stroke="#333"
              fontSize={9}
              tick={{ fill: "#555" }}
              width={44}
              axisLine={false}
              reversed
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0b0b0b",
                border: "1px solid #1e1e1e",
                fontSize: 10,
                fontFamily: "monospace",
              }}
              formatter={(v: number) => [fmtBig(v), "Net GEX"]}
              labelFormatter={(v) => `Strike ${v}`}
              cursor={{ fill: "#141414" }}
            />
            {nearestStrike && (
              <ReferenceLine
                y={nearestStrike.toFixed(0)}
                stroke="#ff8c00"
                strokeDasharray="3 2"
                strokeWidth={1}
                label={{
                  value: `spot ${spot.toFixed(1)}`,
                  position: "right",
                  fill: "#ff8c00",
                  fontSize: 9,
                }}
              />
            )}
            <Bar dataKey="net" isAnimationActive={false}>
              {data.map((row) => (
                <Cell
                  key={row.strike}
                  fill={row.net >= 0 ? "#00d04a" : "#ff3333"}
                  opacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LevelCell({
  label,
  value,
  color,
  border,
}: {
  label: string;
  value: string;
  color: string;
  border?: boolean;
}) {
  return (
    <div className={`px-2 py-1 ${border ? "border-l border-bb-border" : ""}`}>
      <div className="text-[9px] tracking-widest text-bb-muted uppercase">{label}</div>
      <div className="font-mono font-bold text-xs mt-0.5" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
