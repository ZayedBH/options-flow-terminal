import type { GEXProfile } from "../types";
import { fmtBig, fmtPrice } from "../lib/format";

interface Props {
  gex: GEXProfile | null;
}

export function DealerPanel({ gex }: Props) {
  const stateColor =
    gex?.dealer_state === "long_gamma"
      ? "text-bb-cyan"
      : gex?.dealer_state === "short_gamma"
      ? "text-bb-orange"
      : "text-bb-muted";

  return (
    <div className="panel">
      <div className="panel-hdr">
        <span>Dealer Positioning</span>
        <span className={`normal-case font-mono font-normal ${stateColor}`}>
          {gex ? gex.dealer_state.replace("_", " ").toUpperCase() : "—"}
        </span>
      </div>

      {!gex ? (
        <div className="px-2 py-3 text-bb-muted text-xs">No data yet…</div>
      ) : (
        <div className="py-1">
          <StatRow label="Net GEX" value={fmtBig(gex.total_gex)} />
          <StatRow label="Net DEX" value={fmtBig(gex.total_dex)} />
          <StatRow label="Net Vega Exp" value={fmtBig(gex.total_vex)} />
          <StatRow label="Net Vanna" value={fmtBig(gex.total_vanna)} />
          <StatRow label="Net Charm/Day" value={fmtBig(gex.total_charm)} />
          <div className="border-t border-bb-divider mt-1 pt-1">
            <StatRow label="Gamma Flip" value={fmtPrice(gex.gamma_flip)} accent="text-bb-cyan" />
            <StatRow label="Call Wall" value={fmtPrice(gex.largest_call_wall)} accent="text-bb-green" />
            <StatRow label="Put Wall" value={fmtPrice(gex.largest_put_wall)} accent="text-bb-red" />
          </div>
        </div>
      )}
    </div>
  );
}

function StatRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${accent ?? ""}`}>{value}</span>
    </div>
  );
}
