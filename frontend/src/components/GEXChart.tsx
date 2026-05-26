import { useState } from "react";
import type { ExpiryFilter } from "../views/DashboardView";
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

interface FutsInfo {
  label: string;
  multiplier: number;
  futPrice: number;
}

interface Props {
  profile: GEXProfile | null;
  profile0dte?: GEXProfile | null;
  profile1dte?: GEXProfile | null;
  futsInfo?: FutsInfo | null;
  expiryFilter?: ExpiryFilter;
  onExpiryChange?: (f: ExpiryFilter) => void;
}

const RANGES = [3, 5, 10, 15] as const;
type Range = (typeof RANGES)[number];

export function GEXChart({ profile, profile0dte, profile1dte, futsInfo, expiryFilter: expiryFilterProp, onExpiryChange }: Props) {
  const [rangePct, setRangePct] = useState<Range>(3);
  const [localExpiryFilter, setLocalExpiryFilter] = useState<ExpiryFilter>("0dte");

  const expiryFilter = expiryFilterProp ?? localExpiryFilter;
  const setExpiryFilter = (f: ExpiryFilter) => {
    setLocalExpiryFilter(f);
    onExpiryChange?.(f);
  };

  const activeProfile =
    expiryFilter === "0dte" ? (profile0dte ?? null) :
    expiryFilter === "1dte" ? (profile1dte ?? null) :
    profile;

  const displayProfile = activeProfile ?? profile;

  if (!displayProfile) {
    return (
      <div className="panel h-full">
        <div className="panel-hdr">Gamma Exposure</div>
        <div className="px-3 py-3 text-bb-muted text-xs">No data yet…</div>
      </div>
    );
  }

  const noExpiryData = activeProfile === null && expiryFilter !== "all";

  const spot = displayProfile.underlying_price;
  const minK = spot * (1 - rangePct / 100);
  const maxK = spot * (1 + rangePct / 100);

  const data = displayProfile.levels
    .filter((l) => l.strike >= minK && l.strike <= maxK)
    .map((l) => {
      const displayStrike = futsInfo
        ? (l.strike * futsInfo.multiplier).toFixed(0)
        : l.strike.toFixed(0);
      return { strike: l.strike, net: l.net_gex, label: displayStrike };
    });

  // Scale x-axis to the ACTIVE profile only so 0DTE/1DTE bars aren't dwarfed
  // by the full-chain scale
  const xDomain: [number, number] = (() => {
    let maxAbs = 1;
    for (const d of data) {
      const abs = Math.abs(d.net);
      if (abs > maxAbs) maxAbs = abs;
    }
    return [-maxAbs, maxAbs];
  })();

  const nearestStrike = data.reduce(
    (best, d) => Math.abs(d.strike - spot) < Math.abs(best.strike - spot) ? d : best,
    data[0],
  )?.strike;

  const stateHex =
    displayProfile.dealer_state === "long_gamma"  ? "#22d3ee" :
    displayProfile.dealer_state === "short_gamma" ? "#ff6600" : "#666";

  const fmtLevel = (v: number | null) => {
    if (v == null) return "—";
    if (futsInfo) return (v * futsInfo.multiplier).toFixed(0);
    return fmtPrice(v);
  };

  const spotLabel = futsInfo
    ? `${futsInfo.label} ${(spot * futsInfo.multiplier).toFixed(0)}`
    : `spot ${spot.toFixed(1)}`;

  const nearestLabel = data.find((d) => d.strike === nearestStrike)?.label;

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-hdr">
        <span>
          Gamma Exposure · {displayProfile.underlying}{" "}
          <span style={{ color: stateHex, textShadow: `0 0 8px ${stateHex}60` }}>
            [{displayProfile.dealer_state.replace("_", " ").toUpperCase()}]
          </span>
        </span>
        <div className="flex items-center gap-px">
          {/* Expiry toggle — 0DTE / 1DTE only */}
          {(["0dte", "1dte"] as const).map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setExpiryFilter(expiryFilter === ex ? "all" : ex)}
              className="px-3 py-0.5 text-[9px] font-bold tracking-wider transition-all"
              style={expiryFilter === ex ? {
                color: ex === "0dte" ? "#ff3333" : "#ff6600",
                background: ex === "0dte" ? "rgba(255,51,51,0.12)" : "rgba(255,102,0,0.12)",
                borderBottom: `2px solid ${ex === "0dte" ? "#ff3333" : "#ff6600"}`,
                textShadow: "0 0 8px currentColor",
              } : {
                color: "#3a3a3a",
                borderBottom: "2px solid transparent",
              }}
            >
              {ex.toUpperCase()}
            </button>
          ))}
          <div className="w-px h-4 mx-1" style={{ background: "#1a1a1a" }} />
          {/* Range filter */}
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRangePct(r)}
              className="px-2 py-0.5 text-[9px] font-bold tracking-wider transition-all"
              style={r === rangePct ? {
                color: "#ff8c00",
                textShadow: "0 0 8px rgba(255,140,0,0.6)",
                background: "rgba(255,140,0,0.08)",
                borderBottom: "2px solid #ff8c00",
              } : {
                color: "#3a3a3a",
                borderBottom: "2px solid transparent",
              }}
            >
              ±{r}%
            </button>
          ))}
        </div>
      </div>

      {/* Key levels row */}
      <div className="grid grid-cols-3" style={{ borderBottom: "1px solid #111" }}>
        <LevelCell
          label={futsInfo ? `GAMMA FLIP (${futsInfo.label})` : "GAMMA FLIP"}
          value={fmtLevel(displayProfile.gamma_flip)}
          hex="#22d3ee"
        />
        <LevelCell
          label={futsInfo ? `CALL WALL (${futsInfo.label})` : "CALL WALL"}
          value={fmtLevel(displayProfile.largest_call_wall)}
          hex="#00d04a"
          border
        />
        <LevelCell
          label={futsInfo ? `PUT WALL (${futsInfo.label})` : "PUT WALL"}
          value={fmtLevel(displayProfile.largest_put_wall)}
          hex="#ff3333"
          border
        />
      </div>

      {noExpiryData && (
        <div className="px-3 py-1 text-[9px]" style={{ color: "#444", borderBottom: "1px solid #111" }}>
          No {expiryFilter.toUpperCase()} contracts in chain — showing ALL expirations.
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 min-h-0 p-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 4, right: futsInfo ? 72 : 56, top: 4, bottom: 4 }}
            barSize={10}
          >
            <CartesianGrid stroke="#0f0f0f" strokeDasharray="2 2" horizontal={false} />
            <XAxis
              type="number"
              domain={xDomain}
              stroke="#1a1a1a"
              fontSize={8}
              tick={{ fill: "#444" }}
              tickFormatter={(v) => fmtBig(v as number)}
              axisLine={false}
              allowDataOverflow
            />
            <YAxis
              type="category"
              dataKey="label"
              stroke="#1a1a1a"
              fontSize={8}
              tick={{ fill: "#777" }}
              width={futsInfo ? 60 : 48}
              axisLine={false}
              reversed
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#060606",
                border: "1px solid #1a1a1a",
                fontSize: 10,
                fontFamily: "monospace",
                color: "#e0e0e0",
              }}
              itemStyle={{ color: "#e0e0e0" }}
              labelStyle={{ color: "#ff8c00", fontWeight: "bold" }}
              formatter={(v: number) => [fmtBig(v), "Net GEX"]}
              labelFormatter={(label) =>
                futsInfo ? `${futsInfo.label} ${label}` : `Strike ${label}`
              }
              cursor={{ fill: "#0d0d0d" }}
            />
            {nearestLabel && (
              <ReferenceLine
                y={nearestLabel}
                stroke="#ff8c00"
                strokeDasharray="3 2"
                strokeWidth={1}
                label={{
                  value: spotLabel,
                  position: "right",
                  fill: "#ff8c00",
                  fontSize: 9,
                }}
              />
            )}
            <Bar dataKey="net" isAnimationActive={false} barSize={10}>
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

function LevelCell({ label, value, hex, border }: {
  label: string; value: string; hex: string; border?: boolean;
}) {
  return (
    <div
      className={`px-3 py-2 ${border ? "border-l" : ""}`}
      style={{
        borderColor: "#111",
        background: `linear-gradient(180deg, ${hex}06 0%, transparent 100%)`,
      }}
    >
      <div className="text-[8px] tracking-widest uppercase mb-0.5" style={{ color: "#333" }}>
        {label}
      </div>
      <div
        className="font-mono font-bold text-xs"
        style={{ color: hex, textShadow: `0 0 8px ${hex}60` }}
      >
        {value}
      </div>
    </div>
  );
}
