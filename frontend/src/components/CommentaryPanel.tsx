interface Props {
  commentary: string | null;
  notes?: string[];
}

export function CommentaryPanel({ commentary, notes }: Props) {
  return (
    <div className="panel">
      <div className="panel-title">
        <span>AI Commentary</span>
        <span className="text-zinc-500 normal-case">terminal analyst</span>
      </div>
      <div className="text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap">
        {commentary ?? "No commentary yet — waiting for data…"}
      </div>
      {notes && notes.length > 0 && (
        <ul className="mt-3 pt-3 border-t border-terminal-border space-y-1">
          {notes.map((n, i) => (
            <li key={i} className="text-[11px] text-zinc-400">
              · {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
