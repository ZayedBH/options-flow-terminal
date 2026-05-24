interface Props {
  connected: boolean;
  provider?: string;
  pollSeconds?: number;
  symbols?: string[];
}

export function StatusBar({
  connected,
  provider = "yfinance",
  pollSeconds = 60,
  symbols = [],
}: Props) {
  return (
    <footer className="flex items-center h-5 border-t border-bb-border bg-bb-header shrink-0 px-2 gap-4 text-[9px] tracking-wider uppercase text-bb-muted">
      <span className={connected ? "text-bb-green" : "text-bb-red"}>
        ● {connected ? "connected" : "disconnected"}
      </span>
      <Divider />
      <span>src: {provider}</span>
      <Divider />
      <span>delay ~15min</span>
      <Divider />
      <span>poll {pollSeconds}s</span>
      {symbols.length > 0 && (
        <>
          <Divider />
          <span>{symbols.join(" · ")}</span>
        </>
      )}
      <div className="flex-1" />
      <span className="text-bb-dim">OFT v1.0</span>
    </footer>
  );
}

function Divider() {
  return <span className="text-bb-border">│</span>;
}
