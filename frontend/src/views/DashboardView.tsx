import { CommentaryPanel } from "../components/CommentaryPanel";
import { DarkPoolPanel } from "../components/DarkPoolPanel";
import { DealerPanel } from "../components/DealerPanel";
import { FlowTape } from "../components/FlowTape";
import { GEXChart } from "../components/GEXChart";
import { IVDashboard } from "../components/IVDashboard";
import { KeyLevelsPanel } from "../components/KeyLevelsPanel";
import { RegimePanel } from "../components/RegimePanel";
import type { FlowEvent, TerminalSnapshot } from "../types";

interface Props {
  snapshot: TerminalSnapshot;
  flowEvents: FlowEvent[];
}

export function DashboardView({ snapshot, flowEvents }: Props) {
  return (
    <div className="grid grid-cols-12 gap-px bg-bb-border h-full overflow-hidden">
      {/* Left column: analytics panels */}
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-px bg-bb-border overflow-y-auto">
        <RegimePanel
          regime={snapshot.regime}
          underlying={snapshot.underlying}
          underlyingPrice={snapshot.underlying_price}
        />
        <DealerPanel gex={snapshot.gex} />
        <IVDashboard iv={snapshot.iv} />
        <DarkPoolPanel />
      </div>

      {/* Center column: GEX chart + flow tape */}
      <div className="col-span-12 lg:col-span-5 flex flex-col gap-px bg-bb-border overflow-hidden">
        <div className="h-[420px] shrink-0">
          <GEXChart profile={snapshot.gex} />
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
            levels={snapshot.key_levels}
            spot={snapshot.underlying_price}
          />
        </div>
      </div>
    </div>
  );
}
