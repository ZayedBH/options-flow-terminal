export function DarkPoolPanel() {
  return (
    <div className="panel">
      <div className="panel-title">
        <span>Dark Pool</span>
        <span className="text-zinc-500 normal-case">paid feed required</span>
      </div>
      <div className="text-xs text-zinc-400 space-y-2">
        <p>
          FINRA ADF/TRF prints are not available on the free data tier. Plug a
          provider (Unusual Whales, dxFeed, or your own FINRA feed) into the{" "}
          <code className="text-terminal-accent">DataAdapter</code> interface
          and dark-pool sweeps + institutional zones will appear here without
          touching the rest of the system.
        </p>
        <ul className="text-[11px] text-zinc-500 list-disc pl-5">
          <li>Large off-exchange prints with venue ID</li>
          <li>Cumulative accumulation/distribution by symbol</li>
          <li>High-volume node clusters from VWAP-shifted prints</li>
        </ul>
      </div>
    </div>
  );
}
