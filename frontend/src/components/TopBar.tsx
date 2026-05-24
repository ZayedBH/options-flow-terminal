import { useEffect, useState } from "react";

interface Props {
  symbols: string[];
  selected: string;
  onSelect: (s: string) => void;
  connected: boolean;
  lastUpdate: string | null;
}

export function TopBar({ symbols, selected, onSelect, connected, lastUpdate }: Props) {
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString("en-US", { hour12: false }));

  useEffect(() => {
    const id = setInterval(
      () => setClock(new Date().toLocaleTimeString("en-US", { hour12: false })),
      1000,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <header className="flex items-stretch bg-bb-header border-b border-bb-border shrink-0 h-9">
      {/* Brand */}
      <div className="flex items-center px-3 border-r border-bb-border shrink-0">
        <span className="text-bb-amber font-bold tracking-[0.2em] text-sm">OFT</span>
        <span className="text-bb-muted text-[10px] ml-2 tracking-widest uppercase hidden sm:block">
          Options Flow Terminal
        </span>
      </div>

      {/* Symbol tabs */}
      <div className="flex items-stretch overflow-x-auto">
        {symbols.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSelect(s)}
            className={[
              "px-3 text-xs font-bold tracking-wider border-r border-bb-border",
              "transition-colors cursor-pointer uppercase",
              s === selected
                ? "bg-bb-amber text-black"
                : "text-bb-muted hover:text-bb-text hover:bg-[#141414]",
            ].join(" ")}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Status cluster */}
      <div className="flex items-center gap-0 border-l border-bb-border">
        {lastUpdate && (
          <span className="px-3 text-[10px] text-bb-muted border-r border-bb-border hidden md:block">
            UPD {new Date(lastUpdate).toLocaleTimeString("en-US", { hour12: false })}
          </span>
        )}
        <span
          className={[
            "flex items-center gap-1.5 px-3 text-[10px] font-bold tracking-wider",
            connected ? "text-bb-green" : "text-bb-red",
          ].join(" ")}
        >
          <span
            className={[
              "h-1.5 w-1.5 inline-block",
              connected ? "bg-bb-green animate-pulse" : "bg-bb-red",
            ].join(" ")}
          />
          {connected ? "LIVE" : "OFFLINE"}
        </span>
        <span className="px-3 text-[10px] text-bb-muted border-l border-bb-border font-mono">
          {clock}
        </span>
      </div>
    </header>
  );
}
