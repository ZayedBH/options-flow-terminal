interface HeaderProps {
  symbols: string[];
  selected: string;
  onSelect: (symbol: string) => void;
  connected: boolean;
  lastUpdate: string | null;
}

export function Header({
  symbols,
  selected,
  onSelect,
  connected,
  lastUpdate,
}: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-terminal-border bg-terminal-bg px-4 py-2">
      <div className="flex items-center gap-4">
        <div className="text-lg font-bold tracking-wider">
          <span className="text-terminal-accent">OFT</span>
          <span className="text-zinc-400 ml-2 text-sm font-normal">
            Options Flow Terminal
          </span>
        </div>
        <div className="flex gap-1">
          {symbols.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSelect(s)}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                s === selected
                  ? "bg-terminal-accent text-black"
                  : "bg-terminal-panel text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span
          className={`flex items-center gap-1 ${
            connected ? "text-emerald-400" : "text-rose-400"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              connected ? "bg-emerald-400" : "bg-rose-400"
            } animate-pulse`}
          />
          {connected ? "LIVE" : "OFFLINE"}
        </span>
        {lastUpdate && (
          <span className="text-zinc-500">
            updated {new Date(lastUpdate).toLocaleTimeString()}
          </span>
        )}
      </div>
    </header>
  );
}
