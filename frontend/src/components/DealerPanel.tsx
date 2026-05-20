import type { GEXProfile } from "../types";
import { fmtBig, fmtPrice } from "../lib/format";

interface Props {
  gex: GEXProfile | null;
}

export function DealerPanel({ gex }: Props) {
  return (
    <div className="panel">
      <div className="panel-title">
        <span>Dealer Positioning</span>
        <span
          className={
            gex?.dealer_state === "long_gamma"
              ? "text-cyan-300 normal-case"
              : gex?.dealer_state === "short_gamma"
              ? "text-orange-300 normal-case"
              : "text-zinc-500 normal-case"
          }
        >
          {gex ? gex.dealer_state.replace("_", " ") : "—"}
        </span>
      </div>
      {!gex ? (
        <div className="text-zinc-500 text-sm">No data yet…</div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <Row label="Net GEX" value={fmtBig(gex.total_gex)} />
          <Row label="Net DEX" value={fmtBig(gex.total_dex)} />
          <Row label="Net Vega Exp" value={fmtBig(gex.total_vex)} />
          <Row label="Net Vanna" value={fmtBig(gex.total_vanna)} />
          <Row label="Net Charm/day" value={fmtBig(gex.total_charm)} />
          <Row label="Gamma Flip" value={fmtPrice(gex.gamma_flip)} />
          <Row label="Call Wall" value={fmtPrice(gex.largest_call_wall)} />
          <Row label="Put Wall" value={fmtPrice(gex.largest_put_wall)} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono text-zinc-200 text-right">{value}</span>
    </>
  );
}
