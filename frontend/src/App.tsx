import { useEffect, useMemo, useState } from "react";
import { Sidebar, type ViewId } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TopBar } from "./components/TopBar";
import { useTerminalStream } from "./hooks/useTerminalStream";
import { DashboardView } from "./views/DashboardView";
import { FlowView } from "./views/FlowView";
import { LevelsView } from "./views/LevelsView";
import { VolView } from "./views/VolView";

export default function App() {
  const stream = useTerminalStream();
  const symbols = useMemo(() => Object.keys(stream.snapshots).sort(), [stream.snapshots]);

  const [selected, setSelected] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewId>("dashboard");

  // Auto-select first available symbol
  useEffect(() => {
    if (selected === null && symbols.length > 0) setSelected(symbols[0]);
  }, [symbols, selected]);

  const snapshot = selected ? stream.snapshots[selected] : undefined;
  const flowEvents = useMemo(() => {
    if (!selected || !snapshot) return [];
    const fromStream = stream.flow[selected] ?? [];
    const seen = new Set(fromStream.map((f) => f.id));
    const fromSnap = snapshot.recent_flow.filter((f) => !seen.has(f.id));
    return [...fromStream, ...fromSnap].slice(0, 300);
  }, [selected, snapshot, stream.flow]);

  // Keyboard shortcut: F1–F4 to switch views
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F1") { e.preventDefault(); setActiveView("dashboard"); }
      if (e.key === "F2") { e.preventDefault(); setActiveView("flow"); }
      if (e.key === "F3") { e.preventDefault(); setActiveView("vol"); }
      if (e.key === "F4") { e.preventDefault(); setActiveView("levels"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const displaySymbols = symbols.length > 0 ? symbols : ["SPY", "QQQ", "SPX"];

  return (
    <div className="flex flex-col h-screen bg-black text-[#e0e0e0] font-mono overflow-hidden">
      <TopBar
        symbols={displaySymbols}
        selected={selected ?? ""}
        onSelect={setSelected}
        connected={stream.connected}
        lastUpdate={stream.lastUpdate}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar active={activeView} onNav={setActiveView} />

        <main className="flex-1 overflow-hidden bg-black">
          {!snapshot ? (
            <div className="h-full flex flex-col items-center justify-center text-bb-muted text-xs gap-2">
              {stream.error ? (
                <>
                  <span className="text-bb-red font-bold">CONNECTION ERROR</span>
                  <span>{stream.error}</span>
                  <span className="text-bb-dim mt-2">
                    Ensure the backend is running: uvicorn app.main:app --port 8000
                  </span>
                </>
              ) : (
                <>
                  <span className="text-bb-amber font-bold animate-pulse">INITIALIZING…</span>
                  <span>Waiting for first snapshot — backend polls chains every 60s</span>
                  <span className="text-bb-dim mt-1">
                    {stream.connected ? "● Connected" : "○ Connecting to ws://localhost:8000"}
                  </span>
                </>
              )}
            </div>
          ) : (
            <>
              {activeView === "dashboard" && (
                <DashboardView snapshot={snapshot} flowEvents={flowEvents} />
              )}
              {activeView === "flow" && (
                <FlowView flowEvents={flowEvents} underlying={snapshot.underlying} />
              )}
              {activeView === "vol" && (
                <VolView iv={snapshot.iv} underlying={snapshot.underlying} />
              )}
              {activeView === "levels" && (
                <LevelsView
                  levels={snapshot.key_levels}
                  gex={snapshot.gex}
                  spot={snapshot.underlying_price}
                  underlying={snapshot.underlying}
                />
              )}
            </>
          )}
        </main>
      </div>

      <StatusBar
        connected={stream.connected}
        provider="yfinance"
        pollSeconds={60}
        symbols={symbols}
      />
    </div>
  );
}
