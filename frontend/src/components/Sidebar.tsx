export type ViewId = "dashboard" | "flow" | "vol" | "levels";

interface NavItem {
  id: ViewId;
  label: string;
  shortcut: string;
}

const NAV: NavItem[] = [
  { id: "dashboard", label: "DASH", shortcut: "F1" },
  { id: "flow",      label: "FLOW", shortcut: "F2" },
  { id: "vol",       label: " VOL", shortcut: "F3" },
  { id: "levels",    label: " LVL", shortcut: "F4" },
];

interface Props {
  active: ViewId;
  onNav: (v: ViewId) => void;
}

export function Sidebar({ active, onNav }: Props) {
  return (
    <aside className="flex flex-col bg-bb-sidebar border-r border-bb-border w-12 shrink-0">
      {NAV.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onNav(item.id)}
          title={`${item.label} (${item.shortcut})`}
          className={[
            "nav-item",
            active === item.id ? "active" : "",
          ].join(" ")}
        >
          {item.label.trim()}
        </button>
      ))}
      <div className="flex-1" />
    </aside>
  );
}
