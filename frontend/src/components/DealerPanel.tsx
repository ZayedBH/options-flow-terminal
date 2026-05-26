import type { FlowMetrics, GEXProfile } from "../types";
import { fmtBig, fmtPrice } from "../lib/format";

interface FutsInfo {
  label: string;
  multiplier: number;
  futPrice: number;
}

interface Props {
  gex: GEXProfile | null;
  flowMetrics?: FlowMetrics | null;
  futsInfo?: FutsInfo | null;
}

export function DealerPanel({ gex, flowMetrics, futsInfo }: Props) {
  const stateHex =
    gex?.dealer_state === "long_gamma"  ? "#22d3ee" :
    gex?.dealer_state === "short_gamma" ? "#ff6600" : "#555";

  const toFuts = (v: number | null | undefined): string => {
    if (v == null) return "—";
    if (futsInfo) return (v * futsInfo.multiplier).toFixed(0);
    return fmtPrice(v);
  };

  const flipLabel = futsInfo ? `Gamma Flip (${futsInfo.label})` : "Gamma Flip";
  const cwLabel   = futsInfo ? `Call Wall (${futsInfo.label})`  : "Call Wall";
  const pwLabel   = futsInfo ? `Put Wall (${futsInfo.label})`   : "Put Wall";

  return (
    <div className="panel">
      <div className="panel-hdr">
        <span>Dealer Positioning</span>
        <span
          className="normal-case font-mono font-bold text-[10px]"
          style={{ color: stateHex, textShadow: `0 0 8px ${stateHex}60` }}
        >
          {gex ? gex.dealer_state.replace("_", " ").toUpperCase() : "—"}
        </span>
      </div>

      {!gex ? (
        <div className="px-3 py-3 text-bb-muted text-xs">No data yet…</div>
      ) : (
        <div className="py-1">
          <GlowRow label="Net GEX"      value={fmtBig(gex.total_gex)}    hex={gex.total_gex >= 0 ? "#00d04a" : "#ff3333"} />
          <GlowRow label="Net DEX"      value={fmtBig(gex.total_dex)}    hex={gex.total_dex >= 0 ? "#00d04a" : "#ff3333"} />
          <GlowRow label="Net Vega Exp" value={fmtBig(gex.total_vex)}    hex="#4da6ff" />
          <GlowRow label="Net Vanna"    value={fmtBig(gex.total_vanna)}  hex={gex.total_vanna >= 0 ? "#66e090" : "#ff8888"} />
          <GlowRow label="Net Charm"    value={fmtBig(gex.total_charm)}  hex="#a78bfa" />

          <div style={{ borderTop: "1px solid #111", marginTop: 4, paddingTop: 4 }}>
            <GlowRow label={flipLabel} value={toFuts(gex.gamma_flip)}        hex="#22d3ee" />
            <GlowRow label={cwLabel}   value={toFuts(gex.largest_call_wall)} hex="#00d04a" />
            <GlowRow label={pwLabel}   value={toFuts(gex.largest_put_wall)}  hex="#ff3333" />
          </div>

          {flowMetrics && (
            <div style={{ borderTop: "1px solid #111", marginTop: 4, paddingTop: 4 }}>
              <GlowRow
                label="PCR OI"
                value={flowMetrics.pcr_oi != null ? flowMetrics.pcr_oi.toFixed(2) : "—"}
                hex={flowMetrics.pcr_oi != null
                  ? flowMetrics.pcr_oi > 1.2 ? "#ff3333"
                  : flowMetrics.pcr_oi < 0.8 ? "#00d04a" : "#e0e0e0"
                  : undefined}
              />
              <GlowRow label="PCR Vol"  value={flowMetrics.pcr_vol  != null ? flowMetrics.pcr_vol.toFixed(2)  : "—"} />
              <GlowRow
                label="Max Pain"
                value={futsInfo && flowMetrics.max_pain
                  ? (flowMetrics.max_pain * futsInfo.multiplier).toFixed(0)
                  : fmtPrice(flowMetrics.max_pain)}
                hex="#ffd700"
              />
            </div>
          )}
        </div>
      )}
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
