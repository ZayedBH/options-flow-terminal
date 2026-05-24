interface Props {
  commentary: string | null;
  notes?: string[];
}

export function CommentaryPanel({ commentary, notes }: Props) {
  return (
    <div className="panel">
      <div className="panel-hdr">
        <span>AI Commentary</span>
        <span className="text-bb-muted normal-case font-normal">analyst</span>
      </div>
      <div className="px-2 py-2 text-xs leading-relaxed text-bb-text">
        {commentary ?? (
          <span className="text-bb-muted">No commentary yet — waiting for data…</span>
        )}
      </div>
      {notes && notes.length > 0 && (
        <div className="border-t border-bb-divider px-2 py-1.5 space-y-1">
          {notes.map((n, i) => (
            <div key={i} className="text-[10px] text-bb-muted flex gap-1.5">
              <span className="text-bb-amber shrink-0">›</span>
              <span>{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
