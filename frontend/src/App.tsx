import { useEffect, useMemo, useState } from "react";
import { CommentaryPanel } from "./components/CommentaryPanel";
import { DarkPoolPanel } from "./components/DarkPoolPanel";
import { DealerPanel } from "./components/DealerPanel";
import { FlowTape } from "./components/FlowTape";
import { GEXChart } from "./components/GEXChart";
import { Header } from "./components/Header";
import { IVDashboard } from "./components/IVDashboard";
import { KeyLevelsPanel } from "./components/KeyLevelsPanel";
import { RegimePanel } from "./components/RegimePanel";
import { useTerminalStream } from "./hooks/useTerminalStream";

export default function App() {
  const stream = useTerminalStream();
  const symbols = useMemo(
    () => Object.keys(stream.snapshots).sort(),
    [stream.snapshots]
  );
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (selected === null && symbols.length > 0) {
      setSelected(symbols[0]);
    }
  }, [symbols, selected]);

  const active = selected ? stream.snapshots[selected] : undefined;
  const flowEvents = selected ? stream.flow[selected] ?? [] : [];
  const combinedFlow = useMemo(() => {
    if (!active) return flowEvents;
    const seen = new Set(flowEvents.map((f) => f.id));
    const fromSnap = active.recent_flow.filter((f) => !seen.has(f.id));
    return [...flowEvents, ...fromSnap].slice(0, 200);
  }, [active, flowEvents]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        symbols={symbols.length > 0 ? symbols : ["SPY", "QQQ", "SPX"]}
        selected={selected ?? ""}
        onSelect={setSelected}
        connected={stream.connected}
        lastUpdate={stream.lastUpdate}
      />

      {!active ? (
        <div className="flex-1 flex items-center justify-center text-zinc-500">
          {stream.error
            ? `error: ${stream.error}`
            : "Waiting for first snapshot… the backend polls chains every 60s."}
        </div>
      ) : (
        <main className="flex-1 grid grid-cols-12 gap-3 p-3">
          <div className="col-span-12 lg:col-span-4 space-y-3">
            <RegimePanel
              regime={active.regime}
              underlying={active.underlying}
              underlyingPrice={active.underlying_price}
            />
            <DealerPanel gex={active.gex} />
            <IVDashboard iv={active.iv} />
            <DarkPoolPanel />
          </div>

          <div className="col-span-12 lg:col-span-5 space-y-3 flex flex-col">
            <div className="h-[420px]">
              <GEXChart profile={active.gex} />
            </div>
            <div className="flex-1 min-h-[260px]">
              <FlowTape events={combinedFlow} underlying={active.underlying} />
            </div>
          </div>

          <div className="col-span-12 lg:col-span-3 space-y-3 flex flex-col">
            <CommentaryPanel
              commentary={active.commentary}
              notes={active.regime?.notes}
            />
            <div className="flex-1 min-h-[260px]">
              <KeyLevelsPanel
                levels={active.key_levels}
                spot={active.underlying_price}
              />
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
