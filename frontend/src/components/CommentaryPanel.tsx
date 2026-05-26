interface Props {
  commentary: string | null;
  notes?: string[];
}

export function CommentaryPanel({ commentary, notes }: Props) {
  return (
    <div className="panel">
      <div className="panel-hdr">
        <span>Commentary</span>
        <span className="normal-case font-normal text-[9px]" style={{ color: "#333" }}>
          analyst
        </span>
      </div>
      <div className="px-3 py-2 text-[11px] leading-relaxed" style={{ color: "#999" }}>
        {commentary ?? (
          <span style={{ color: "#333" }}>No commentary yet — waiting for data…</span>
        )}
      </div>
      {notes && notes.length > 0 && (
        <div className="px-3 py-1.5 space-y-1" style={{ borderTop: "1px solid #0d0d0d" }}>
          {notes.map((n, i) => (
            <div key={i} className="text-[9px] flex gap-2" style={{ color: "#444" }}>
              <span style={{ color: "#ff8c00", textShadow: "0 0 6px rgba(255,140,0,0.5)" }}>›</span>
              <span className="leading-snug">{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
