export function DarkPoolPanel() {
  return (
    <div className="panel">
      <div className="panel-hdr">
        <span>Dark Pool</span>
        <span className="text-bb-muted normal-case font-normal">paid feed req'd</span>
      </div>
      <div className="px-2 py-2 text-[10px] text-bb-muted space-y-2">
        <p>
          FINRA ADF/TRF prints unavailable on free tier. Plug a provider
          (Unusual Whales, dxFeed) into the{" "}
          <code className="text-bb-amber">DataAdapter</code> interface to unlock:
        </p>
        <ul className="space-y-1 text-[9px] text-bb-dim pl-2">
          <li className="flex gap-2"><span className="text-bb-amber">›</span> Large off-exchange prints with venue ID</li>
          <li className="flex gap-2"><span className="text-bb-amber">›</span> Cumulative accumulation / distribution</li>
          <li className="flex gap-2"><span className="text-bb-amber">›</span> High-volume VWAP-shifted node clusters</li>
        </ul>
      </div>
    </div>
  );
}
