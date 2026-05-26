import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { IVSkewChart } from "../components/IVSkewChart";
import type { IVSummary } from "../types";
import { fmtPct, fmtPctOf100 } from "../lib/format";

interface Props {
  iv: IVSummary | null;
  underlying: string;
  spot?: number;
}

const TENOR_ORDER = ["0dte", "1w", "2w", "1m", "2m", "3m", "6m", "1y+"];

export function VolView({ iv, underlying, spot }: Props) {
  if (!iv) {
    return (
      <div className="h-full flex items-center justify-center text-xs" style={{ color: "#333" }}>
        Waiting for volatility data…
      </div>
    );
  }

  const tsData = TENOR_ORDER
    .filter((t) => iv.term_structure[t] !== undefined)
    .map((t) => ({ tenor: t, iv: +(iv.term_structure[t] * 100).toFixed(2) }));

  const stateHex =
    iv.state === "expansion"   ? "#ff6600" :
    iv.state === "compression" ? "#22d3ee" :
    iv.state === "crush"       ? "#ff3333" : "#555";

  const rankHex = iv.iv_rank != null
    ? iv.iv_rank > 70 ? "#ff3333" : iv.iv_rank > 40 ? "#ff8c00" : "#00d04a"
    : "#555";

  const inverted = tsData.length >= 2 &&
    tsData[0].iv > tsData[tsData.length - 1].iv * 1.05;

  const hasSkew = Object.keys(iv.skew_by_expiry ?? {}).length > 0;

  return (
    <div className="h-full grid grid-cols-12 gap-px overflow-hidden" style={{ background: "#111" }}>

      {/* ── Stats panel ───────────────────────────────────────── */}
      <div className="col-span-12 lg:col-span-3 flex flex-col overflow-y-auto" style={{ background: "#080808" }}>
        <div className="panel flex-1" style={{ border: "none" }}>
          <div className="panel-hdr">
            <span>Volatility · {underlying}</span>
            <span
              className="normal-case font-mono font-bold text-[10px]"
              style={{ color: stateHex, textShadow: `0 0 8px ${stateHex}60` }}
            >
              {iv.state.toUpperCase()}
            </span>
          </div>

          <Section label="Current" />
          <GlowRow label="ATM IV (30D)"      value={fmtPct(iv.atm_iv)}                hex="#ff8c00" />
          <GlowRow label="IV Rank"           value={fmtPctOf100(iv.iv_rank)}           hex={rankHex} />
          <GlowRow label="IV Percentile"     value={fmtPctOf100(iv.iv_percentile)} />
          <GlowRow
            label="Realized Vol 20D"
            value={iv.realized_vol_20d !== null ? fmtPct(iv.realized_vol_20d) : "—"}
            hex="#4da6ff"
          />

          <Section label="Skew" />
          <GlowRow
            label="25Δ Skew"
            value={iv.skew_25d !== null ? fmtPct(iv.skew_25d) : "—"}
            hex={iv.skew_25d != null && iv.skew_25d > 0.04 ? "#ff6600" : undefined}
          />
          <GlowRow label="State" value={iv.state.toUpperCase()} hex={stateHex} />

          <Section label={`Term Structure${inverted ? " · INVERTED" : " · CONTANGO"}`}
            accent={inverted ? "#ff3333" : "#00d04a"} />
          {TENOR_ORDER.filter((t) => iv.term_structure[t] !== undefined).map((t) => (
            <GlowRow
              key={t}
              label={t.toUpperCase()}
              value={fmtPct(iv.term_structure[t])}
              hex="#ff8c00"
            />
          ))}
        </div>
      </div>

      {/* ── Right column: term structure + skew chart ─────────── */}
      <div
        className="col-span-12 lg:col-span-9 flex flex-col gap-px overflow-hidden"
        style={{ background: "#111" }}
      >
        {/* Term structure chart */}
        <div
          className="panel flex flex-col"
          style={{ border: "none", background: "#060606", flex: hasSkew ? "0 0 45%" : "1 1 0" }}
        >
          <div className="panel-hdr">
            <span>IV Term Structure</span>
            <div className="flex items-center gap-2">
              <span
                className="text-[9px] font-bold px-2 py-0.5"
                style={{
                  color: inverted ? "#ff3333" : "#00d04a",
                  border: `1px solid ${inverted ? "#ff3333" : "#00d04a"}40`,
                  background: `${inverted ? "#ff3333" : "#00d04a"}0d`,
                  textShadow: `0 0 6px ${inverted ? "#ff333360" : "#00d04a60"}`,
                }}
              >
                {inverted ? "INVERTED" : "CONTANGO"}
              </span>
              <span className="normal-case font-normal text-[9px]" style={{ color: "#333" }}>
                ATM IV by expiration tenor
              </span>
            </div>
          </div>
          <div className="flex-1 min-h-0 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tsData} margin={{ top: 16, right: 24, bottom: 24, left: 12 }}>
                <CartesianGrid stroke="#0f0f0f" strokeDasharray="3 3" />
                <XAxis
                  dataKey="tenor"
                  stroke="#1a1a1a"
                  tick={{ fill: "#555", fontSize: 11, fontFamily: "monospace" }}
                  label={{ value: "Tenor", position: "insideBottom", offset: -12, fill: "#333", fontSize: 10 }}
                />
                <YAxis
                  stroke="#1a1a1a"
                  tick={{ fill: "#555", fontSize: 11, fontFamily: "monospace" }}
                  tickFormatter={(v) => `${(v as number).toFixed(0)}%`}
                  label={{ value: "IV %", angle: -90, position: "insideLeft", fill: "#333", fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#060606",
                    border: "1px solid #1a1a1a",
                    fontSize: 11,
                    fontFamily: "monospace",
                  }}
                  formatter={(v: number) => [`${v.toFixed(2)}%`, "IV"]}
                />
                <Line
                  type="monotone"
                  dataKey="iv"
                  stroke="#ff8c00"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#ff8c00", strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: "#ff8c00" }}
                  style={{ filter: "drop-shadow(0 0 6px rgba(255,140,0,0.6))" }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* IV Skew curve chart */}
        {hasSkew && (
          <div className="flex-1 min-h-0" style={{ background: "#060606" }}>
            <IVSkewChart iv={iv} spot={spot ?? iv.atm_iv ?? 0} />
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ label, accent }: { label: string; accent?: string }) {
  const color = accent ?? "#ff8c00";
  return (
    <div
      className="px-3 py-1.5 text-[8px] font-bold tracking-[0.15em] uppercase"
      style={{
        color,
        textShadow: `0 0 8px ${color}50`,
        borderBottom: `1px solid ${color}20`,
        borderLeft: `2px solid ${color}60`,
        background: `linear-gradient(90deg, ${color}08 0%, transparent 100%)`,
        marginTop: 4,
      }}
    >
      {label}
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
