import { useState } from "react";
import { CommentaryPanel } from "../components/CommentaryPanel";
import { DarkPoolPanel } from "../components/DarkPoolPanel";
import { DealerPanel } from "../components/DealerPanel";
import { FlowTape } from "../components/FlowTape";
import { GEXChart } from "../components/GEXChart";
import { IVDashboard } from "../components/IVDashboard";
import { KeyLevelsPanel } from "../components/KeyLevelsPanel";
import { RegimePanel } from "../components/RegimePanel";
import type { FlowEvent, GEXProfile, KeyLevel, TerminalSnapshot } from "../types";

interface FutsInfo {
  label: string;
  multiplier: number;
  futPrice: number;
}

interface Props {
  snapshot: TerminalSnapshot;
  flowEvents: FlowEvent[];
  futsInfo?: FutsInfo | null;
}

export type ExpiryFilter = "all" | "0dte" | "1dte";

function keyLevelsFromGexProfile(gex: GEXProfile): KeyLevel[] {
  const levels: KeyLevel[] = [];
  if (gex.gamma_flip != null)
    levels.push({ price: gex.gamma_flip, label: "Gamma Flip", kind: "gamma_flip", strength: 0.95, note: null });
  if (gex.largest_call_wall != null)
    levels.push({ price: gex.largest_call_wall, label: "Call Wall", kind: "call_wall", strength: 0.9, note: null });
  if (gex.largest_put_wall != null)
    levels.push({ price: gex.largest_put_wall, label: "Put Wall", kind: "put_wall", strength: 0.9, note: null });

  const taken = new Set([gex.gamma_flip, gex.largest_call_wall, gex.largest_put_wall]);
  const magnets = [...gex.levels]
    .filter((l) => !taken.has(l.strike) && l.call_oi + l.put_oi > 0)
    .sort((a, b) => (b.call_oi + b.put_oi) - (a.call_oi + a.put_oi))
    .slice(0, 3);
  for (const m of magnets)
    levels.push({ price: m.strike, label: "OI Magnet", kind: "magnet", strength: 0.7, note: null });

  return levels;
}

export function DashboardView({ snapshot, flowEvents, futsInfo }: Props) {
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("0dte");

  const activeGex =
    expiryFilter === "0dte" ? (snapshot.gex_0dte ?? snapshot.gex) :
    expiryFilter === "1dte" ? (snapshot.gex_1dte ?? snapshot.gex) :
    snapshot.gex;

  const activeKeyLevels =
    expiryFilter !== "all" && activeGex
      ? keyLevelsFromGexProfile(activeGex)
      : snapshot.key_levels;

  return (
    <div className="grid grid-cols-12 gap-px bg-bb-border h-full overflow-hidden">
      {/* Left column: analytics panels */}
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-px bg-bb-border overflow-y-auto">
        <RegimePanel
          regime={snapshot.regime}
          underlying={snapshot.underlying}
          underlyingPrice={snapshot.underlying_price}
        />
        <DealerPanel gex={activeGex} flowMetrics={snapshot.flow_metrics} futsInfo={futsInfo} />
        <IVDashboard iv={snapshot.iv} />
        <DarkPoolPanel />
      </div>

      {/* Center column: GEX chart + flow tape */}
      <div className="col-span-12 lg:col-span-5 flex flex-col gap-px bg-bb-border overflow-hidden">
        <div className="h-[600px] shrink-0">
          <GEXChart
            profile={snapshot.gex}
            profile0dte={snapshot.gex_0dte}
            profile1dte={snapshot.gex_1dte}
            futsInfo={futsInfo}
            expiryFilter={expiryFilter}
            onExpiryChange={setExpiryFilter}
          />
        </div>
        <div className="flex-1 min-h-0">
          <FlowTape events={flowEvents} underlying={snapshot.underlying} compact />
        </div>
      </div>

      {/* Right column: commentary + key levels */}
      <div className="col-span-12 lg:col-span-3 flex flex-col gap-px bg-bb-border overflow-hidden">
        <CommentaryPanel
          commentary={snapshot.commentary}
          notes={snapshot.regime?.notes}
        />
        <div className="flex-1 min-h-0">
          <KeyLevelsPanel
            levels={activeKeyLevels}
            spot={snapshot.underlying_price}
            futsInfo={futsInfo}
          />
        </div>
      </div>
    </div>
  );
}
