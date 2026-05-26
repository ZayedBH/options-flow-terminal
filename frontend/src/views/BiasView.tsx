import { useState } from "react";
import { useMacro } from "../hooks/useMacro";
import type {
  BiasOutput,
  BiasSubScore,
  BiasTimeframe,
  FlowEvent,
  TerminalSnapshot,
} from "../types";

interface FutsInfo { label: string; multiplier: number; futPrice: number }
interface Props {
  snapshot: TerminalSnapshot;
  flowEvents: FlowEvent[];
  futsInfo: FutsInfo | null;
}

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
  bull:   "#00d04a",
  bear:   "#ff3333",
  amber:  "#ff8c00",
  blue:   "#4da6ff",
  purple: "#a78bfa",
  cyan:   "#22d3ee",
  dim:    "#383838",
  muted:  "#666666",
  panel:  "#080808",
  border: "#1a1a1a",
  text:   "#e0e0e0",
};

const BIAS_COLORS: Record<string, string> = {
  "Strong Bullish":         C.bull,
  "Bullish":                C.bull,
  "Mild Bullish":           "#7ec86e",
  "Neutral":                C.amber,
  "Mild Bearish":           "#ff9966",
  "Bearish":                C.bear,
  "Strong Bearish":         C.bear,
  "Volatility Expansion":   "#ff00aa",
  "Range-Bound / Pinned":   C.cyan,
};

const REGIME_COLORS: Record<string, string> = {
  "Strong Bullish":         C.bull,
  "Bullish":                C.bull,
  "Bullish Chop":           "#7ec86e",
  "Neutral Chop":           C.amber,
  "Bearish Chop":           C.amber,
  "Bearish":                C.bear,
  "Strong Bearish":         C.bear,
  "Volatility Expansion":   "#ff00aa",
  "Volatility Compression": "#7ec86e",
  "Dealer Long Gamma":      "#7ec86e",
  "Dealer Short Gamma":     C.amber,
  "Gamma Squeeze Risk":     "#ff00aa",
};

function biasColor(label: string): string {
  return BIAS_COLORS[label] ?? C.amber;
}
function regimeColor(r: string): string {
  return REGIME_COLORS[r] ?? C.text;
}

// ─── Formatting ───────────────────────────────────────────────────────────────
function fmtBn(v: number | null | undefined): string {
  if (v == null) return "—";
  const abs = Math.abs(v), sign = v >= 0 ? "+" : "−";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
function fmtIV(v: number | null | undefined) {
  return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
}
function fmtPremM(v: number) { return `$${(v / 1e6).toFixed(1)}M`; }

// ─── Bias gauge (horizontal bar from −100 to +100) ────────────────────────────
function BiasGauge({ bias, label, confidence, gate }: {
  bias: number; label: string; confidence: number; gate: string | null;
}) {
  const color = biasColor(label);
  const pct   = (bias + 100) / 2;   // map −100..+100 → 0..100

  return (
    <div className="flex flex-col gap-1.5">
      {/* Label row */}
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="text-lg font-bold tracking-wider"
          style={{ color, textShadow: `0 0 16px ${color}60` }}
        >
          {label.toUpperCase()}
        </span>
        <div className="flex items-center gap-2">
          {gate && (
            <span
              className="text-[9px] font-bold tracking-widest px-2 py-0.5 uppercase"
              style={{
                color: gate === "vol_expansion" ? "#ff00aa" : C.cyan,
                border: `1px solid ${gate === "vol_expansion" ? "#ff00aa50" : C.cyan + "50"}`,
                background: gate === "vol_expansion" ? "#ff00aa12" : C.cyan + "12",
              }}
            >
              {gate === "vol_expansion" ? "VOL GATE" : "PIN GATE"}
            </span>
          )}
          <span className="text-[9px] tabular-nums font-mono" style={{ color: "#444" }}>
            CONF {(confidence * 100).toFixed(0)}%
          </span>
          <span
            className="text-[22px] font-bold tabular-nums font-mono"
            style={{ color, textShadow: `0 0 12px ${color}60` }}
          >
            {bias >= 0 ? "+" : ""}{bias.toFixed(1)}
          </span>
        </div>
      </div>
      {/* Bar */}
      <div className="relative h-3" style={{ background: "#0d0d0d" }}>
        {/* Zero marker */}
        <div className="absolute top-0 left-1/2 w-px h-full" style={{ background: "#2a2a2a" }} />
        {/* Fill */}
        <div
          className="absolute top-0 h-full transition-all duration-700"
          style={{
            left:   bias >= 0 ? "50%" : `${pct}%`,
            width:  `${Math.abs(bias) / 2}%`,
            background: color,
            boxShadow:  `0 0 8px ${color}70`,
          }}
        />
        {/* Confidence underlay */}
        <div
          className="absolute bottom-0 h-[1px]"
          style={{
            left:       bias >= 0 ? "50%" : `${pct}%`,
            width:      `${Math.abs(bias) * confidence / 2}%`,
            background: color + "50",
          }}
        />
      </div>
      <div className="flex justify-between text-[7px]" style={{ color: "#2a2a2a" }}>
        <span>STRONG BEAR −100</span>
        <span>STRONG BULL +100</span>
      </div>
    </div>
  );
}

// ─── Timeframe selector tab ────────────────────────────────────────────────────
function TFTab({
  name, bias, label, active, onClick,
}: {
  name: string; bias: number; label: string; active: boolean; onClick: () => void;
}) {
  const color = biasColor(label);
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center gap-0.5 py-2 px-1 transition-all"
      style={{
        background:   active ? `${color}0d` : "transparent",
        borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
        borderTop:    "none",
        borderLeft:   "none",
        borderRight:  "none",
        cursor:       "pointer",
      }}
    >
      <span
        className="text-[8px] tracking-widest uppercase font-bold"
        style={{ color: active ? color : "#444" }}
      >
        {name}
      </span>
      <span
        className="text-[13px] font-bold tabular-nums font-mono"
        style={{
          color,
          textShadow: active ? `0 0 8px ${color}70` : "none",
          opacity:    active ? 1 : 0.55,
        }}
      >
        {bias >= 0 ? "+" : ""}{bias.toFixed(0)}
      </span>
    </button>
  );
}

// ─── Gamma regime indicator ────────────────────────────────────────────────────
function GammaRegimeBar({ gamma_regime, dealer_state }: {
  gamma_regime: number; dealer_state: string;
}) {
  const pct   = (gamma_regime + 1) / 2 * 100;   // −1..+1 → 0..100
  const color = gamma_regime > 0.2
    ? C.bull
    : gamma_regime < -0.2
    ? C.bear
    : C.amber;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[8px] tracking-widest uppercase" style={{ color: "#333" }}>
          Gamma Regime
        </span>
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-bold tracking-wider"
            style={{ color, textShadow: `0 0 6px ${color}50` }}
          >
            {dealer_state.replace("_", " ").toUpperCase()}
          </span>
          <span className="text-[10px] tabular-nums font-mono" style={{ color }}>
            {gamma_regime >= 0 ? "+" : ""}{gamma_regime.toFixed(3)}
          </span>
        </div>
      </div>
      <div className="relative h-2" style={{ background: "#0d0d0d" }}>
        <div className="absolute top-0 left-1/2 w-px h-full" style={{ background: "#222" }} />
        <div
          className="absolute top-0 h-full transition-all duration-700"
          style={{
            left:       gamma_regime >= 0 ? "50%" : `${pct}%`,
            width:      `${Math.abs(gamma_regime) * 50}%`,
            background: `linear-gradient(90deg, ${color}60, ${color})`,
            boxShadow:  `0 0 6px ${color}60`,
          }}
        />
      </div>
      <div className="flex justify-between text-[7px]" style={{ color: "#2a2a2a" }}>
        <span>SHORT GAMMA</span>
        <span>LONG GAMMA</span>
      </div>
    </div>
  );
}

// ─── Sub-score bar ────────────────────────────────────────────────────────────
function SubScoreRow({ name, sub }: { name: string; sub: BiasSubScore }) {
  const color  = biasColor(sub.label);
  const pct    = (sub.score + 1) / 2 * 100;  // −1..+1 → 0..100

  return (
    <div className="py-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[9px] tracking-wider uppercase" style={{ color: "#555" }}>
          {name}
        </span>
        <div className="flex items-center gap-2">
          <span
            className="text-[8px] font-bold"
            style={{ color: color + "bb", textShadow: `0 0 4px ${color}40` }}
          >
            {sub.label.toUpperCase()}
          </span>
          <span className="text-[9px] tabular-nums font-mono" style={{ color }}>
            {sub.score >= 0 ? "+" : ""}{sub.score.toFixed(2)}
          </span>
        </div>
      </div>
      {/* Bidirectional bar centred at 0 */}
      <div className="relative h-[3px]" style={{ background: "#111" }}>
        <div className="absolute top-0 left-1/2 w-px h-full" style={{ background: "#222" }} />
        <div
          className="absolute top-0 h-full transition-all duration-500"
          style={{
            left:       sub.score >= 0 ? "50%" : `${pct}%`,
            width:      `${Math.abs(sub.score) * 50}%`,
            background: color,
            boxShadow:  sub.confidence > 0.5 ? `0 0 4px ${color}80` : "none",
            opacity:    0.3 + sub.confidence * 0.7,
          }}
        />
      </div>
    </div>
  );
}

// ─── Sub-score panel for a timeframe ─────────────────────────────────────────
const SUB_SCORE_LABELS: Record<string, string> = {
  dex:   "Delta Exposure",
  vanna: "Vanna × IV Dir",
  charm: "Charm × Time",
  skew:  "Put / Call Skew",
  pcr:   "PCR Signal",
  walls: "Gamma Walls",
  term:  "Term Structure",
};

function SubScorePanel({ tf }: { tf: BiasTimeframe }) {
  const allKeys = ["dex", "vanna", "charm", "skew", "pcr", "walls", "term"];
  const ordered = allKeys.filter(k => k in tf.sub_scores);

  return (
    <div className="space-y-0">
      {ordered.map(k => (
        <SubScoreRow
          key={k}
          name={SUB_SCORE_LABELS[k] ?? k.toUpperCase()}
          sub={tf.sub_scores[k]}
        />
      ))}
      {tf.contract_count > 0 && (
        <div className="pt-1 text-[8px] tabular-nums" style={{ color: "#2a2a2a" }}>
          {tf.contract_count} contracts in bucket
        </div>
      )}
    </div>
  );
}

// ─── MetricBar ────────────────────────────────────────────────────────────────
function MetricBar({ label, display, color, pct, dim = false }: {
  label: string; display?: string;
  color: string; pct: number; dim?: boolean;
}) {
  return (
    <div className={`py-1 ${dim ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[9px] text-bb-muted tracking-wider">{label}</span>
        <span className="text-[10px] font-mono font-bold tabular-nums"
          style={{ color, textShadow: pct > 60 ? `0 0 6px ${color}50` : "none" }}>
          {display ?? "—"}
        </span>
      </div>
      <div className="h-[2px] w-full" style={{ background: "#111" }}>
        <div
          className="h-full transition-all duration-700"
          style={{
            width: `${Math.max(1, Math.min(100, pct))}%`,
            background: color,
            boxShadow: pct > 50 ? `0 0 6px ${color}60` : "none",
          }}
        />
      </div>
    </div>
  );
}

// ─── GlowChip ────────────────────────────────────────────────────────────────
function GlowChip({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-block text-[9px] font-bold tracking-[0.15em] uppercase px-2 py-0.5"
      style={{
        color,
        border: `1px solid ${color}50`,
        background: `${color}10`,
        boxShadow: `0 0 8px ${color}30, inset 0 0 8px ${color}10`,
      }}>
      {label}
    </span>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────
function Divider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 my-2">
      <div className="flex-1 h-px" style={{ background: "#1a1a1a" }} />
      {label && <span className="text-[8px] tracking-widest text-[#2a2a2a] uppercase shrink-0">{label}</span>}
      <div className="flex-1 h-px" style={{ background: "#1a1a1a" }} />
    </div>
  );
}

// ─── ColHead ──────────────────────────────────────────────────────────────────
function ColHead({ title, color }: { title: string; color: string }) {
  return (
    <div className="px-3 py-2 mb-2 shrink-0"
      style={{
        borderBottom: `1px solid ${color}30`,
        borderLeft:   `3px solid ${color}`,
        background:   `linear-gradient(90deg, ${color}12 0%, transparent 100%)`,
      }}>
      <span className="text-[10px] font-bold tracking-[0.18em] uppercase"
        style={{ color, textShadow: `0 0 10px ${color}60` }}>
        {title}
      </span>
    </div>
  );
}

// ─── Term structure ────────────────────────────────────────────────────────────
const TERM_ORDER = ["0dte","1w","2w","1m","2m","3m","6m","1y+"];
function TermStructure({ ts, atm }: { ts: Record<string, number>; atm: number | null }) {
  const keys = TERM_ORDER.filter(k => ts[k] != null);
  if (!keys.length) return null;
  const max = Math.max(...keys.map(k => ts[k]));
  const min = Math.min(...keys.map(k => ts[k]));
  const inverted = keys.length >= 2 && ts[keys[0]] > ts[keys[keys.length - 1]] * 1.05;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8px] tracking-widest uppercase" style={{ color: "#333" }}>Term Structure</span>
        <GlowChip label={inverted ? "INVERTED" : "CONTANGO"} color={inverted ? C.bear : C.bull} />
      </div>
      <div className="space-y-0.5">
        {keys.map(k => {
          const iv  = ts[k];
          const pct = max > min ? ((iv - min) / (max - min)) * 100 : 50;
          const isATM = atm != null && Math.abs(iv - atm) < 0.003;
          return (
            <div key={k} className="flex items-center gap-2">
              <span className="text-[8px] w-7 shrink-0 tabular-nums"
                style={{ color: isATM ? C.amber : "#444" }}>{k}</span>
              <div className="flex-1 h-[3px]" style={{ background: "#111" }}>
                <div className="h-full" style={{
                  width: `${pct}%`,
                  background: inverted
                    ? `linear-gradient(90deg, ${C.bear}80, ${C.bear})`
                    : `linear-gradient(90deg, ${C.blue}80, ${C.blue})`,
                  boxShadow: isATM ? `0 0 6px ${C.amber}` : "none",
                }} />
              </div>
              <span className="text-[8px] font-mono tabular-nums w-10 text-right"
                style={{ color: isATM ? C.amber : "#555" }}>
                {fmtIV(iv)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Fear & Greed bar ────────────────────────────────────────────────────────
function FearGreedBar({ score, rating }: { score: number; rating: string }) {
  const color = score >= 70 ? C.bear : score >= 55 ? C.amber : score <= 25 ? C.bull : score <= 45 ? "#7ec86e" : C.text;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8px] tracking-widest uppercase" style={{ color: "#333" }}>CNN Fear &amp; Greed</span>
        <span className="text-[10px] font-bold tabular-nums"
          style={{ color, textShadow: `0 0 8px ${color}60` }}>
          {score.toFixed(0)} — {rating.toUpperCase()}
        </span>
      </div>
      <div className="relative h-3 overflow-hidden"
        style={{ background: "linear-gradient(90deg, #00d04a, #7ec86e 30%, #ff8c00 50%, #ff6600 70%, #ff3333)" }}>
        <div className="absolute top-0 h-full w-[3px]"
          style={{ left: `calc(${score}% - 1.5px)`, background: "white", boxShadow: "0 0 6px rgba(255,255,255,0.8)" }} />
        <div className="absolute top-0 right-0 h-full"
          style={{ width: `${100 - score}%`, background: "rgba(0,0,0,0.65)" }} />
      </div>
      <div className="flex justify-between text-[7px] mt-0.5" style={{ color: "#333" }}>
        <span>EXTREME FEAR</span><span>EXTREME GREED</span>
      </div>
    </div>
  );
}

// ─── Sentiment bar ────────────────────────────────────────────────────────────
function SentimentBar({ score }: { score: number }) {
  const color = score > 30 ? C.bull : score < -30 ? C.bear : C.amber;
  const pct   = (score + 100) / 2;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8px] tracking-widest uppercase" style={{ color: "#333" }}>Composite Sentiment</span>
        <span className="text-[10px] font-bold"
          style={{ color, textShadow: `0 0 8px ${color}60` }}>
          {score >= 0 ? "+" : ""}{score.toFixed(0)}
        </span>
      </div>
      <div className="relative h-[3px]" style={{ background: "#111" }}>
        <div className="absolute top-0 left-1/2 w-px h-full" style={{ background: "#2a2a2a" }} />
        <div className="absolute top-0 h-full"
          style={{
            left:       score >= 0 ? "50%" : `${pct}%`,
            width:      score >= 0 ? `${pct - 50}%` : `${50 - pct}%`,
            background: color,
            boxShadow:  `0 0 6px ${color}80`,
          }} />
      </div>
      <div className="flex justify-between text-[7px] mt-0.5" style={{ color: "#2a2a2a" }}>
        <span>BEAR −100</span><span>BULL +100</span>
      </div>
    </div>
  );
}

// ─── Ring gauge ──────────────────────────────────────────────────────────────
function RingGauge({ value, label, color, size = 90 }: {
  value: number; label: string; color: string; size?: number;
}) {
  const r = 32, cx = 44, cy = 44;
  const circ   = 2 * Math.PI * r;
  const filled = (value / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox="0 0 88 88">
        <defs>
          <filter id={`glow-${label}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#111" strokeWidth="5"/>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="butt"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ filter: `drop-shadow(0 0 6px ${color}90)` }}
        />
        <text x={cx} y={cy - 4} textAnchor="middle" fill={color} fontSize="15" fontWeight="700"
          fontFamily="'JetBrains Mono',monospace"
          style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}>
          {value.toFixed(0)}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="#555" fontSize="7"
          fontFamily="'JetBrains Mono',monospace" letterSpacing="1">/ 100</text>
      </svg>
      <div className="text-[9px] tracking-widest uppercase font-bold text-center"
        style={{ color, textShadow: `0 0 8px ${color}60` }}>{label}</div>
    </div>
  );
}

// ─── BIAS ENGINE SECTION ──────────────────────────────────────────────────────
function BiasEngineSection({ bias }: { bias: BiasOutput }) {
  const [activeTF, setActiveTF] = useState<"intraday" | "daily" | "weekly" | "monthly">("daily");

  const tfMap: Record<string, BiasTimeframe> = {
    intraday: bias.intraday,
    daily:    bias.daily,
    weekly:   bias.weekly,
    monthly:  bias.monthly,
  };

  const current = tfMap[activeTF];
  const activeColor = biasColor(current.label);

  const TABS: { key: "intraday" | "daily" | "weekly" | "monthly"; name: string }[] = [
    { key: "intraday", name: "0–2 DTE" },
    { key: "daily",    name: "3–9 DTE" },
    { key: "weekly",   name: "10–35 DTE" },
    { key: "monthly",  name: "36–90 DTE" },
  ];

  return (
    <div
      className="shrink-0 px-4 pt-3 pb-2"
      style={{
        background:    `linear-gradient(180deg, ${activeColor}08 0%, transparent 100%)`,
        borderBottom:  `1px solid ${activeColor}18`,
        boxShadow:     `0 1px 24px ${activeColor}08`,
      }}
    >
      {/* Top row: title + gamma regime + dealer state */}
      <div className="flex items-start gap-4 mb-3">
        {/* Left: title + gamma */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] font-bold tracking-[0.18em] uppercase" style={{ color: "#444" }}>
              Bias Engine
            </span>
            <span className="text-[8px] tabular-nums" style={{ color: "#2a2a2a" }}>
              {new Date(bias.timestamp).toLocaleTimeString("en-US", { hour12: false })}
            </span>
          </div>
          <GammaRegimeBar gamma_regime={bias.gamma_regime} dealer_state={bias.dealer_state} />
        </div>

        {/* Right: 4 mini timeframe tabs */}
        <div className="flex gap-px shrink-0" style={{ borderBottom: "1px solid #1a1a1a" }}>
          {TABS.map(({ key, name }) => (
            <TFTab
              key={key}
              name={name}
              bias={tfMap[key].bias}
              label={tfMap[key].label}
              active={activeTF === key}
              onClick={() => setActiveTF(key)}
            />
          ))}
        </div>
      </div>

      {/* Active timeframe bias gauge */}
      <BiasGauge
        bias={current.bias}
        label={current.label}
        confidence={current.confidence}
        gate={current.gate}
      />

      {/* Sub-scores for active timeframe */}
      <div className="mt-3 pt-2" style={{ borderTop: "1px solid #141414" }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[8px] tracking-widest uppercase" style={{ color: "#2a2a2a" }}>
            Signal Breakdown · {TABS.find(t => t.key === activeTF)?.name}
          </span>
        </div>
        <SubScorePanel tf={current} />
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export function BiasView({ snapshot, flowEvents }: Props) {
  const { data: macro } = useMacro();
  const regime = snapshot.regime;
  const bias   = snapshot.bias;
  const gex    = snapshot.gex;
  const iv     = snapshot.iv;
  const fm     = snapshot.flow_metrics;
  const spot   = snapshot.underlying_price;
  const fg     = macro.fear_greed;

  // No data at all
  if (!regime && !bias) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <div className="text-[10px] tracking-widest uppercase" style={{ color: C.amber }}>
          Awaiting first chain poll…
        </div>
        <div className="text-[9px]" style={{ color: "#444" }}>
          Bias engine initialises after the first options chain loads.
        </div>
      </div>
    );
  }

  // Regime-based header stats (kept from old engine for context)
  const rColor   = regime ? regimeColor(regime.regime) : C.amber;
  const dpScore  = regime?.dealer_pressure_score ?? 50;
  const veScore  = regime?.vol_expansion_score   ?? 30;
  const faScore  = regime?.flow_aggression_score ?? 50;

  const dealerState  = gex?.dealer_state ?? "unknown";
  const dealerColor  = dealerState === "long_gamma" ? C.bull
    : dealerState === "short_gamma" ? C.bear : C.amber;
  const volStateColor = regime?.volatility_state === "expansion" ? C.bear
    : regime?.volatility_state === "compression" ? C.bull
    : regime?.volatility_state === "crush" ? C.amber : C.blue;

  let bullPrem = 0, bearPrem = 0;
  for (const e of flowEvents) {
    if (e.side === "bullish") bullPrem += e.premium;
    if (e.side === "bearish") bearPrem += e.premium;
  }
  const netPrem   = bullPrem - bearPrem;
  const totalPrem = bullPrem + bearPrem;

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "#020202" }}>

      {/* ── BIAS ENGINE (new) ─────────────────────────────────────────────── */}
      {bias && <BiasEngineSection bias={bias} />}

      {/* ── OLD REGIME BANNER (fallback / extra context) ──────────────────── */}
      {regime && (
        <div
          className="shrink-0 px-4 py-2"
          style={{
            background:   `linear-gradient(180deg, ${rColor}08 0%, transparent 100%)`,
            borderBottom: `1px solid ${rColor}18`,
          }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[11px] font-bold tracking-widest"
              style={{ color: rColor, textShadow: `0 0 12px ${rColor}50` }}>
              {regime.regime.toUpperCase()}
            </span>
            <span className="text-[9px] font-mono px-1.5 py-0.5"
              style={{ color: rColor, border: `1px solid ${rColor}30`, background: `${rColor}0d` }}>
              {(regime.confidence * 100).toFixed(0)}% CONF
            </span>
            {[
              { label: "INTRA",  v: regime.intraday_bias },
              { label: "DAILY",  v: regime.daily_bias },
              { label: "WEEKLY", v: regime.weekly_bias },
            ].map(({ label, v }) => (
              <div key={label} className="flex items-center gap-1">
                <span className="text-[7px] tracking-widest" style={{ color: "#2a2a2a" }}>{label}</span>
                <span className="text-[9px] font-bold"
                  style={{ color: biasColor(v), textShadow: `0 0 6px ${biasColor(v)}50` }}>
                  {v}
                </span>
              </div>
            ))}
            {fg && (
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-[7px] tracking-widest" style={{ color: "#333" }}>F&amp;G</span>
                <span className="text-[10px] font-bold tabular-nums" style={{
                  color: fg.score >= 70 ? C.bear : fg.score >= 55 ? C.amber : fg.score <= 30 ? C.bull : "#7ec86e",
                  textShadow: "0 0 6px currentColor",
                }}>
                  {fg.score.toFixed(0)} {fg.rating.toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── THREE COLUMNS ────────────────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-3 overflow-hidden min-h-0"
        style={{ borderTop: "1px solid #111" }}>

        {/* ── LEFT: DEALER POSTURE ──────────────────────────────────────── */}
        <div className="flex flex-col overflow-y-auto"
          style={{ borderRight: "1px solid #111", background: "#030303" }}>
          <ColHead title="Dealer Posture" color={C.blue} />
          <div className="px-3 pb-3 space-y-2">
            <div className="flex items-center justify-between">
              <GlowChip label={dealerState.replace("_", " ").toUpperCase()} color={dealerColor} />
              {regime?.vvix != null && (
                <div className="text-right">
                  <div className="text-[7px] tracking-widest uppercase" style={{ color: "#333" }}>VVIX</div>
                  <div className="text-[12px] font-bold tabular-nums"
                    style={{
                      color: regime.vvix > 120 ? C.bear : regime.vvix < 90 ? C.bull : C.amber,
                      textShadow: "0 0 8px currentColor",
                    }}>
                    {regime.vvix.toFixed(1)}
                  </div>
                </div>
              )}
            </div>
            <Divider label="Exposures" />
            {gex && (
              <>
                <MetricBar label="Net GEX" display={fmtBn(gex.total_gex)}
                  color={gex.total_gex > 0 ? C.bull : C.bear}
                  pct={Math.min(100, Math.abs(gex.total_gex) / 1e9 * 20)} />
                <MetricBar label="Net DEX" display={fmtBn(regime?.total_dex)}
                  color={(regime?.total_dex ?? 0) > 0 ? C.bull : C.bear}
                  pct={Math.min(100, Math.abs(regime?.total_dex ?? 0) / 5e8 * 20)} />
                <MetricBar label="Net VEX" display={fmtBn(regime?.total_vex)}
                  color={C.blue}
                  pct={Math.min(100, Math.abs(regime?.total_vex ?? 0) / 1e8 * 30)} />
                <MetricBar label="Vanna Exp" display={fmtBn(regime?.total_vanna)}
                  color={(regime?.total_vanna ?? 0) > 0 ? "#7ec86e" : "#ff8888"}
                  pct={Math.min(100, Math.abs(regime?.total_vanna ?? 0) / 1e7 * 20)} />
                <MetricBar label="Charm Exp" display={fmtBn(regime?.total_charm)}
                  color={(regime?.total_charm ?? 0) > 0 ? "#ffd700" : "#ff8c00"}
                  pct={Math.min(100, Math.abs(regime?.total_charm ?? 0) / 1e6 * 20)} />
              </>
            )}
            <Divider label="Key Levels" />
            {[
              { label: "Gamma Flip", val: gex?.gamma_flip,        color: C.amber },
              { label: "Call Wall ▲", val: gex?.largest_call_wall, color: C.bull },
              { label: "Put Wall ▼",  val: gex?.largest_put_wall,  color: C.bear },
              { label: "Spot",        val: spot,                   color: C.text },
            ].map(({ label, val, color }) =>
              val != null ? (
                <div key={label} className="flex items-center justify-between py-1"
                  style={{ borderBottom: "1px solid #0e0e0e" }}>
                  <span className="text-[9px]" style={{ color: "#555" }}>{label}</span>
                  <span className="text-[11px] font-mono font-bold tabular-nums"
                    style={{ color, textShadow: `0 0 6px ${color}40` }}>
                    ${(val as number).toFixed(2)}
                  </span>
                </div>
              ) : null
            )}
            {regime && (
              <>
                <Divider label="Risk" />
                {[
                  { label: "Squeeze Risk", val: regime.gamma_squeeze_risk * 100,
                    color: regime.gamma_squeeze_risk > 0.6 ? C.bear : regime.gamma_squeeze_risk > 0.4 ? C.amber : C.bull },
                  { label: "Mean Revert",  val: regime.mean_reversion_score * 100,     color: C.blue },
                  { label: "Trend Cont.",  val: regime.trend_continuation_score * 100, color: C.purple },
                ].map(({ label, val, color }) => (
                  <MetricBar key={label} label={label}
                    display={`${val.toFixed(0)}%`} color={color} pct={val} />
                ))}
              </>
            )}
          </div>
        </div>

        {/* ── CENTER: VOLATILITY ───────────────────────────────────────────── */}
        <div className="flex flex-col overflow-y-auto"
          style={{ borderRight: "1px solid #111", background: "#030505" }}>
          <ColHead title="Volatility" color={C.amber} />
          <div className="px-3 pb-3 space-y-2">
            {regime && (
              <div className="flex items-center justify-between">
                <GlowChip
                  label={(regime.volatility_state ?? "NORMAL").toUpperCase()}
                  color={volStateColor}
                />
              </div>
            )}
            <Divider label="IV Surface" />
            {iv && (
              <>
                <MetricBar label="ATM IV (30d)" display={fmtIV(iv.atm_iv)}
                  color={C.text} pct={Math.min(100, (iv.atm_iv ?? 0) * 200)} />
                <MetricBar label="IV Rank"
                  display={iv.iv_rank != null ? iv.iv_rank.toFixed(1) : "—"}
                  color={iv.iv_rank != null ? (iv.iv_rank > 70 ? C.bear : iv.iv_rank > 40 ? C.amber : C.bull) : "#555"}
                  pct={iv.iv_rank ?? 0} />
                <MetricBar label="IV Percentile"
                  display={iv.iv_percentile != null ? iv.iv_percentile.toFixed(1) : "—"}
                  color={C.muted} pct={iv.iv_percentile ?? 0} />
                <MetricBar label="Realized Vol 20d" display={fmtIV(iv.realized_vol_20d)}
                  color={C.blue} pct={Math.min(100, (iv.realized_vol_20d ?? 0) * 200)} />
                {iv.atm_iv && iv.realized_vol_20d && iv.realized_vol_20d > 0 && (
                  <MetricBar label="IV / RV Ratio"
                    display={`${(iv.atm_iv / iv.realized_vol_20d).toFixed(2)}×`}
                    color={iv.atm_iv / iv.realized_vol_20d > 1.4 ? C.amber
                      : iv.atm_iv / iv.realized_vol_20d < 0.75 ? C.bear : C.bull}
                    pct={Math.min(100, (iv.atm_iv / iv.realized_vol_20d) * 40)} />
                )}
                <MetricBar label="25Δ Put Skew"
                  display={iv.skew_25d != null ? iv.skew_25d.toFixed(3) : "—"}
                  color={iv.skew_25d != null
                    ? iv.skew_25d > 0.06 ? C.bear : iv.skew_25d > 0.03 ? C.amber : C.bull
                    : "#555"}
                  pct={Math.min(100, (iv.skew_25d ?? 0) * 1000)} />
              </>
            )}
            <Divider label="Term Structure" />
            {iv?.term_structure && Object.keys(iv.term_structure).length > 0 && (
              <TermStructure ts={iv.term_structure} atm={iv?.atm_iv ?? null} />
            )}
            <Divider label="Vol Indices" />
            {[
              { key: "^VIX",  label: "VIX",  threshold: [16, 20, 25] },
              { key: "^VVIX", label: "VVIX", threshold: [90, 100, 120] },
              { key: "^VXN",  label: "VXN",  threshold: [16, 22, 28] },
            ].map(({ key, label, threshold }) => {
              const ind = macro.indicators[key];
              if (!ind) return null;
              const price = ind.price ?? 0;
              const color = price > threshold[2] ? C.bear : price > threshold[1] ? C.amber
                : price < threshold[0] ? C.bull : "#7ec86e";
              return (
                <div key={key} className="flex items-center justify-between py-0.5"
                  style={{ borderBottom: "1px solid #0e0e0e" }}>
                  <span className="text-[9px]" style={{ color: "#555" }}>{label}</span>
                  <div className="flex items-center gap-2">
                    {ind.change_pct != null && (
                      <span className="text-[8px] tabular-nums"
                        style={{ color: ind.change_pct >= 0 ? C.bear : C.bull }}>
                        {ind.change_pct >= 0 ? "+" : ""}{ind.change_pct.toFixed(2)}%
                      </span>
                    )}
                    <span className="text-[12px] font-bold tabular-nums font-mono"
                      style={{ color, textShadow: `0 0 6px ${color}50` }}>
                      {price.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: FLOW SENTIMENT ────────────────────────────────────────── */}
        <div className="flex flex-col overflow-y-auto" style={{ background: "#040305" }}>
          <ColHead title="Flow Sentiment" color={C.cyan} />
          <div className="px-3 pb-3 space-y-2">
            {regime && <SentimentBar score={regime.sentiment_score} />}
            <Divider label="Premium Breakdown" />
            <div className="grid grid-cols-2 gap-2 py-1">
              {[
                { label: "Bull Premium", val: bullPrem, color: C.bull },
                { label: "Bear Premium", val: bearPrem, color: C.bear },
              ].map(({ label, val, color }) => (
                <div key={label} className="py-1.5 px-2"
                  style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
                  <div className="text-[7px] tracking-widest uppercase mb-1" style={{ color: "#444" }}>
                    {label}
                  </div>
                  <div className="text-[13px] font-bold tabular-nums"
                    style={{ color, textShadow: `0 0 8px ${color}50` }}>
                    {fmtPremM(val)}
                  </div>
                </div>
              ))}
            </div>
            <MetricBar label="Net Premium"
              display={`${netPrem >= 0 ? "+" : ""}${fmtPremM(netPrem)}`}
              color={netPrem >= 0 ? C.bull : C.bear}
              pct={totalPrem > 0 ? (bullPrem / totalPrem) * 100 : 50} />
            <MetricBar label="Total Premium"
              display={fmtPremM(totalPrem)}
              color={C.muted}
              pct={Math.min(100, totalPrem / 5e6 * 100)} />
            <Divider label="Put / Call Ratios" />
            {[
              { label: "PCR OI",  val: fm?.pcr_oi,  color: fm?.pcr_oi  != null ? (fm.pcr_oi  < 0.7 ? C.bull : fm.pcr_oi  > 1.3 ? C.bear : C.amber) : "#555", pct: fm?.pcr_oi  != null ? Math.min(100, fm.pcr_oi  * 50) : 50 },
              { label: "PCR Vol", val: fm?.pcr_vol, color: fm?.pcr_vol != null ? (fm.pcr_vol < 0.7 ? C.bull : fm.pcr_vol > 1.3 ? C.bear : C.amber) : "#555", pct: fm?.pcr_vol != null ? Math.min(100, fm.pcr_vol * 50) : 50 },
            ].map(({ label, val, color, pct }) => (
              <MetricBar key={label} label={label}
                display={val != null ? (val as number).toFixed(2) : "—"}
                color={color} pct={pct} />
            ))}
            {fm?.max_pain != null && (
              <div className="flex items-center justify-between py-1"
                style={{ borderBottom: "1px solid #0e0e0e" }}>
                <span className="text-[9px]" style={{ color: "#555" }}>Max Pain</span>
                <span className="text-[11px] font-mono font-bold tabular-nums"
                  style={{ color: C.amber, textShadow: `0 0 6px ${C.amber}40` }}>
                  ${fm.max_pain.toFixed(0)}
                </span>
              </div>
            )}
            {fm && (
              <>
                <MetricBar
                  label={`Call OI  ${fm.total_call_oi > 0 ? `${(fm.total_call_oi / 1e3).toFixed(0)}K` : "—"}`}
                  color={C.bull}
                  pct={fm.total_call_oi + fm.total_put_oi > 0
                    ? (fm.total_call_oi / (fm.total_call_oi + fm.total_put_oi)) * 100 : 50} />
                <MetricBar
                  label={`Put OI   ${fm.total_put_oi > 0 ? `${(fm.total_put_oi / 1e3).toFixed(0)}K` : "—"}`}
                  color={C.bear}
                  pct={fm.total_call_oi + fm.total_put_oi > 0
                    ? (fm.total_put_oi / (fm.total_call_oi + fm.total_put_oi)) * 100 : 50} />
              </>
            )}
            {fg && (
              <>
                <Divider label="Sentiment Index" />
                <FearGreedBar score={fg.score} rating={fg.rating} />
              </>
            )}
            {/* Old regime gauge scores */}
            {regime && (
              <>
                <Divider label="Regime Gauges" />
                <div className="flex items-center justify-around py-2">
                  <RingGauge value={dpScore} label="Dealer P."
                    color={dpScore > 65 ? C.bull : dpScore < 35 ? C.bear : C.amber} size={70} />
                  <RingGauge value={veScore} label="Vol Exp."
                    color={veScore > 65 ? C.bear : veScore < 35 ? C.bull : C.amber} size={70} />
                  <RingGauge value={faScore} label="Flow Agg."
                    color={faScore > 65 ? C.cyan : faScore < 35 ? "#555" : C.purple} size={70} />
                </div>
                {(regime.expected_move_1d != null || regime.expected_move_1w != null) && (
                  <>
                    <Divider label="Expected Move" />
                    <div className="flex gap-4 py-1 justify-center">
                      {regime.expected_move_1d != null && (
                        <div className="text-center">
                          <div className="text-[7px]" style={{ color: "#444" }}>1-DAY</div>
                          <div className="text-[11px] font-bold font-mono" style={{ color: C.blue }}>
                            ±${regime.expected_move_1d.toFixed(2)}
                          </div>
                          {spot > 0 && (
                            <div className="text-[8px]" style={{ color: "#555" }}>
                              ±{(regime.expected_move_1d / spot * 100).toFixed(2)}%
                            </div>
                          )}
                        </div>
                      )}
                      {regime.expected_move_1w != null && (
                        <div className="text-center">
                          <div className="text-[7px]" style={{ color: "#444" }}>1-WEEK</div>
                          <div className="text-[11px] font-bold font-mono" style={{ color: C.blue }}>
                            ±${regime.expected_move_1w.toFixed(2)}
                          </div>
                          {spot > 0 && (
                            <div className="text-[8px]" style={{ color: "#555" }}>
                              ±{(regime.expected_move_1w / spot * 100).toFixed(2)}%
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── SIGNAL NOTES ─────────────────────────────────────────────────── */}
      {regime?.notes && regime.notes.length > 0 && (
        <div className="shrink-0 max-h-20 overflow-y-auto px-4 py-2"
          style={{ borderTop: "1px solid #111", background: "#030303" }}>
          <div className="flex flex-wrap gap-x-6 gap-y-0.5">
            {regime.notes.map((note, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span style={{ color: "#2a2a2a" }}>·</span>
                <span className="text-[9px] leading-snug" style={{ color: "#444" }}>{note}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
