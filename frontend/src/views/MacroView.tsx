import { Fragment } from "react";
import { useMacro } from "../hooks/useMacro";
import type { FedSeries, MacroIndicator, NewsItem } from "../hooks/useMacro";

const INDICATOR_ORDER = [
  { key: "^TNX",     group: "RATES" },
  { key: "^TYX",     group: "RATES" },
  { key: "^FVX",     group: "RATES" },
  { key: "^IRX",     group: "RATES" },
  { key: "DX-Y.NYB", group: "FX / RISK" },
  { key: "^VIX",     group: "FX / RISK" },
  { key: "GC=F",     group: "COMMODITIES" },
  { key: "SI=F",     group: "COMMODITIES" },
  { key: "CL=F",     group: "COMMODITIES" },
  { key: "BTC-USD",  group: "CRYPTO" },
];

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmtChg(bn: number | null | undefined): string {
  if (bn == null || isNaN(bn)) return "—";
  const abs = Math.abs(bn);
  if (abs >= 1000) return `$${(bn / 1000).toFixed(2)}T`;
  if (abs >= 10)   return `$${bn.toFixed(0)}B`;
  return `$${bn.toFixed(1)}B`;
}

function fmtFedVal(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  if (v >= 1000) return `$${(v / 1000).toFixed(2)}T`;
  return `$${v.toFixed(1)}B`;
}

function fmtVal(v: number | null, sym: string): string {
  if (v === null) return "—";
  if (sym === "BTC-USD") return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (sym === "GC=F" || sym === "SI=F" || sym === "CL=F") return `$${v.toFixed(2)}`;
  if (sym === "^TNX" || sym === "^TYX" || sym === "^FVX" || sym === "^IRX") return `${v.toFixed(3)}%`;
  return v.toFixed(2);
}

function fmtChange(chg: number | null, pct: number | null): { text: string; hex: string } {
  if (chg === null && pct === null) return { text: "—", hex: "#333" };
  const sign = (pct ?? chg ?? 0) >= 0 ? "+" : "";
  const pctStr = pct !== null ? `${sign}${pct.toFixed(2)}%` : "";
  return {
    text: pctStr || `${sign}${chg?.toFixed(3)}`,
    hex:  (pct ?? chg ?? 0) >= 0 ? "#00d04a" : "#ff3333",
  };
}

function fmtNewsDate(raw: string): string {
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw.slice(0, 16);
    return (
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
    );
  } catch { return raw.slice(0, 16); }
}

// ─── Risk appetite ────────────────────────────────────────────────────────────

function riskAppetite(indicators: Record<string, MacroIndicator>): {
  label: string; hex: string; detail: string;
} {
  const vix    = indicators["^VIX"]?.price ?? null;
  const tnxCh  = indicators["^TNX"]?.change_pct ?? null;
  const dxyCh  = indicators["DX-Y.NYB"]?.change_pct ?? null;
  const goldCh = indicators["GC=F"]?.change_pct ?? null;

  let score = 0;
  const notes: string[] = [];

  if (vix !== null) {
    if (vix < 15)      { score += 2; notes.push(`VIX ${vix.toFixed(1)} — calm`); }
    else if (vix < 20) { score += 1; notes.push(`VIX ${vix.toFixed(1)} — normal`); }
    else if (vix < 30) { score -= 1; notes.push(`VIX ${vix.toFixed(1)} — elevated`); }
    else               { score -= 3; notes.push(`VIX ${vix.toFixed(1)} — fear`); }
  }
  if (dxyCh !== null) {
    if (dxyCh > 0.3)       { score -= 1; notes.push(`DXY +${dxyCh.toFixed(2)}% — dollar strength`); }
    else if (dxyCh < -0.3) { score += 1; notes.push(`DXY ${dxyCh.toFixed(2)}% — dollar weak`); }
  }
  if (goldCh !== null && goldCh > 0.5) {
    score -= 1; notes.push(`Gold +${goldCh.toFixed(2)}% — safe haven bid`);
  }
  if (tnxCh !== null) {
    if (tnxCh > 3)       { score -= 1; notes.push(`10Y yield rising — rate pressure`); }
    else if (tnxCh < -3) { score += 1; notes.push(`10Y yield falling — rate relief`); }
  }

  if (score >= 2)  return { label: "RISK ON",  hex: "#00d04a", detail: notes.join(" · ") };
  if (score <= -2) return { label: "RISK OFF", hex: "#ff3333", detail: notes.join(" · ") };
  return                  { label: "NEUTRAL",  hex: "#ff8c00", detail: notes.join(" · ") };
}

// ─── Liquidity summary ────────────────────────────────────────────────────────

interface LiquidityResult {
  signal: string;
  hex: string;
  sentences: string[];
  netBn: number | null;
}

function buildLiquiditySummary(fed: Record<string, FedSeries>): LiquidityResult {
  const assetChg = fed["WALCL"]?.change_bn     ?? null;
  const rrpChg   = fed["RRPONTSYD"]?.change_bn ?? null;
  const tgaChg   = fed["WTREGEN"]?.change_bn   ?? null;
  const m2Chg    = fed["M2SL"]?.change_bn      ?? null;

  const netBn =
    assetChg != null || tgaChg != null || rrpChg != null
      ? (assetChg ?? 0) - (tgaChg ?? 0) - (rrpChg ?? 0)
      : null;

  const sentences: string[] = [];

  if (assetChg !== null) {
    if (assetChg > 20)
      sentences.push(`The Fed expanded its balance sheet by ${fmtChg(assetChg)}, actively injecting liquidity into the system.`);
    else if (assetChg > 2)
      sentences.push(`The Fed added ${fmtChg(assetChg)} to its balance sheet — a modest injection, but smaller than what's needed to move markets on its own.`);
    else if (assetChg >= -2)
      sentences.push(`The Fed's balance sheet was essentially flat (${fmtChg(assetChg)}), no meaningful injection or drain from this side.`);
    else if (assetChg > -20)
      sentences.push(`The Fed trimmed its balance sheet by ${fmtChg(Math.abs(assetChg))} — a mild QT drain, not large enough to be the dominant factor.`);
    else
      sentences.push(`The Fed is actively running QT, shrinking its balance sheet by ${fmtChg(Math.abs(assetChg))} — a direct and significant liquidity drain.`);
  }

  if (tgaChg !== null) {
    if (tgaChg > 80)
      sentences.push(`The TGA surged +${fmtChg(tgaChg)}, meaning the Treasury pulled a large amount of cash out of the banking system — this is the dominant drain in this reading.`);
    else if (tgaChg > 20)
      sentences.push(`The TGA rose +${fmtChg(tgaChg)}, absorbing meaningful liquidity as Treasury built its cash buffer — a notable headwind.`);
    else if (tgaChg > 5)
      sentences.push(`The TGA increased +${fmtChg(tgaChg)}, a mild drain as Treasury accumulated cash.`);
    else if (tgaChg >= -5)
      sentences.push(`The TGA was roughly unchanged (${fmtChg(tgaChg)}), no significant drag or release.`);
    else if (tgaChg > -80)
      sentences.push(`The TGA dropped ${fmtChg(tgaChg)}, Treasury spending into the economy and releasing liquidity — a mild tailwind.`);
    else
      sentences.push(`The TGA collapsed ${fmtChg(tgaChg)} — Treasury deployed its cash aggressively, injecting a large amount of liquidity into the system.`);
  }

  if (rrpChg !== null) {
    if (rrpChg < -50)
      sentences.push(`RRP drained hard (${fmtChg(rrpChg)}), releasing significant cash back into markets — a real liquidity tailwind.`);
    else if (rrpChg < -10)
      sentences.push(`RRP fell ${fmtChg(rrpChg)}, releasing cash back into the system and providing some cushion.`);
    else if (rrpChg < -2)
      sentences.push(`RRP declined modestly (${fmtChg(rrpChg)}), adding a small amount of liquidity at the margin.`);
    else if (rrpChg > 50)
      sentences.push(`RRP jumped +${fmtChg(rrpChg)}, pulling a large amount of cash away from markets — a significant tightening signal.`);
    else if (rrpChg > 10)
      sentences.push(`RRP rose +${fmtChg(rrpChg)}, absorbing liquidity from the system — a moderate headwind.`);
    else if (rrpChg > 2)
      sentences.push(`RRP edged up +${fmtChg(rrpChg)}, pulling a small amount of cash away from markets.`);
  }

  if (m2Chg !== null && Math.abs(m2Chg) > 30) {
    if (m2Chg > 0)
      sentences.push(`M2 expanded +${fmtChg(m2Chg)}, showing the broader money supply is growing — supportive for risk assets over time.`);
    else
      sentences.push(`M2 contracted ${fmtChg(m2Chg)}, a sign the broader money supply is tightening — a longer-term headwind for risk assets.`);
  }

  let signal: string, hex: string, verdict: string;

  if (netBn === null) {
    signal = "NO DATA"; hex = "#444";
    verdict = "Insufficient FRED data to compute net liquidity position.";
  } else if (netBn > 100) {
    signal = "NET INJECTION"; hex = "#00d04a";
    verdict = `Net liquidity this period: +${fmtChg(netBn)}. This is a clear injection — the environment is expansionary and supportive for risk assets. The path of least resistance is higher.`;
  } else if (netBn > 20) {
    signal = "MILD INJECTION"; hex = "#66e090";
    verdict = `Net liquidity this period: +${fmtChg(netBn)}. Conditions are mildly accommodative — a modest tailwind, though not strong enough to be a primary market driver on its own.`;
  } else if (netBn > -20) {
    signal = "MIXED"; hex = "#ff8c00";
    verdict = `Net liquidity this period: ${netBn >= 0 ? "+" : ""}${fmtChg(netBn)}. Injection and drain forces are roughly offsetting — the macro liquidity backdrop is neutral.`;
  } else if (netBn > -100) {
    signal = "MILD DRAIN"; hex = "#ff8c00";
    verdict = `Net liquidity this period: ${fmtChg(netBn)}. This is a net drain — conditions are tightening moderately. Upside becomes harder to sustain without a fundamental catalyst.`;
  } else {
    signal = "NET DRAIN"; hex = "#ff3333";
    verdict = `Net liquidity this period: ${fmtChg(netBn)}. This is a clear net liquidity drain — the environment shifts away from supportive. Upside becomes harder and the probability of downside follow-through increases.`;
  }

  sentences.push(verdict);
  return { signal, hex, sentences, netBn };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FedLiquidityPanel({ fed }: { fed: Record<string, FedSeries> }) {
  const liq = buildLiquiditySummary(fed);
  const firstDate = Object.values(fed)[0]?.date ?? "";

  return (
    <div className="flex flex-col overflow-y-auto">
      {/* Signal badge + net */}
      <div className="flex items-center gap-3 px-3 pt-2 pb-2" style={{ borderBottom: "1px solid #0d0d0d" }}>
        <span
          className="text-[9px] font-bold tracking-widest px-2 py-0.5"
          style={{
            color: liq.hex,
            border: `1px solid ${liq.hex}40`,
            background: `${liq.hex}0d`,
            textShadow: `0 0 8px ${liq.hex}60`,
            boxShadow: `0 0 6px ${liq.hex}20`,
          }}
        >
          {liq.signal}
        </span>
        {liq.netBn !== null && (
          <span className="text-[9px]" style={{ color: "#3a3a3a" }}>
            net {liq.netBn >= 0 ? "+" : ""}{fmtChg(liq.netBn)} this period
          </span>
        )}
      </div>

      {/* Narrative */}
      <div className="px-3 py-2 space-y-2" style={{ borderBottom: "1px solid #0d0d0d" }}>
        {liq.sentences.map((s, i) => (
          <p key={i} className="text-[10px] leading-relaxed"
            style={{ color: i === liq.sentences.length - 1 ? liq.hex : "#5a5a5a" }}>
            {s}
          </p>
        ))}
      </div>

      {/* Raw FRED rows */}
      <div className="py-1">
        {Object.entries(fed).map(([id, s]) => (
          <div key={id} className="stat-row">
            <span className="stat-label">{s.label}</span>
            <div className="flex items-center gap-2">
              {s.change_bn != null && (
                <span className="text-[9px] font-bold"
                  style={{
                    color: s.change_bn >= 0 ? "#00d04a" : "#ff3333",
                    textShadow: `0 0 6px ${s.change_bn >= 0 ? "#00d04a" : "#ff3333"}50`,
                  }}>
                  {s.change_bn >= 0 ? "+" : ""}{fmtFedVal(s.change_bn)}
                </span>
              )}
              <span className="stat-value">{fmtFedVal(s.value_bn)}</span>
            </div>
          </div>
        ))}
        <div className="px-3 pt-2 text-[8px]" style={{ color: "#2a2a2a" }}>
          Source: FRED · {firstDate}
        </div>
      </div>
    </div>
  );
}

function LiquidityNote() {
  const bullets = [
    "When Fed balance sheet SHRINKS (QT) → less liquidity → headwind for equities",
    "When RRP drains → cash moves into markets → tailwind for risk assets",
    "When TGA rises → Treasury absorbs liquidity → tightening effect",
    "When M2 grows → money supply expanding → supportive for equities & commodities",
  ];
  return (
    <div className="mt-2 space-y-1.5" style={{ borderTop: "1px solid #0d0d0d", paddingTop: 8 }}>
      <div className="text-[8px] font-bold tracking-widest uppercase px-3"
        style={{ color: "#ff8c00", textShadow: "0 0 6px rgba(255,140,0,0.4)" }}>
        Liquidity Framework
      </div>
      {bullets.map((b, i) => (
        <div key={i} className="flex gap-2 px-3 text-[9px] leading-snug" style={{ color: "#3a3a3a" }}>
          <span style={{ color: "#333" }}>·</span>
          <span>{b}</span>
        </div>
      ))}
    </div>
  );
}

function NewsRow({ item }: { item: NewsItem }) {
  return (
    <div
      className="px-3 py-2.5 transition-colors"
      style={{ borderBottom: "1px solid #0a0a0a" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#0c0c0c"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <div className="flex items-start gap-2.5">
        {/* Source badge */}
        <span
          className="text-[8px] font-bold tracking-wider shrink-0 mt-0.5 w-16 truncate"
          style={{ color: "#ff8c00", textShadow: "0 0 6px rgba(255,140,0,0.35)" }}
        >
          {item.source.toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] leading-snug block transition-colors"
              style={{ color: "#aaa" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#ff8c00"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#aaa"; }}
            >
              {item.title}
            </a>
          ) : (
            <span className="text-[11px] leading-snug block" style={{ color: "#aaa" }}>
              {item.title}
            </span>
          )}
          {item.summary && (
            <p className="text-[9px] mt-0.5 leading-snug line-clamp-2" style={{ color: "#3a3a3a" }}>
              {item.summary}
            </p>
          )}
        </div>
        <span className="text-[8px] shrink-0 tabular-nums" style={{ color: "#282828" }}>
          {fmtNewsDate(item.published)}
        </span>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function MacroView() {
  const { data, loading, error } = useMacro();
  const risk = riskAppetite(data.indicators);

  const grouped: Record<string, typeof INDICATOR_ORDER> = {};
  for (const item of INDICATOR_ORDER) {
    (grouped[item.group] ??= []).push(item);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "#020202" }}>

      {/* ── Market environment banner ────────────────────────── */}
      <div
        className="flex items-center gap-4 px-4 py-2 shrink-0"
        style={{
          background: `linear-gradient(90deg, ${risk.hex}0d 0%, transparent 60%)`,
          borderBottom: `1px solid ${risk.hex}20`,
          borderLeft: `3px solid ${risk.hex}`,
        }}
      >
        <span className="text-[9px] tracking-widest uppercase" style={{ color: "#333" }}>
          Market Environment
        </span>
        <span
          className="font-bold text-sm tracking-widest"
          style={{ color: risk.hex, textShadow: `0 0 12px ${risk.hex}60` }}
        >
          {risk.label}
        </span>
        {risk.detail && (
          <span className="text-[9px] truncate" style={{ color: "#3a3a3a" }}>
            {risk.detail}
          </span>
        )}
        {data.timestamp && (
          <span className="ml-auto text-[9px] tabular-nums" style={{ color: "#222" }}>
            UPD {new Date(data.timestamp).toLocaleTimeString("en-US", { hour12: false })}
          </span>
        )}
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center text-xs animate-pulse" style={{ color: "#333" }}>
          Fetching macro data…
        </div>
      )}
      {error && (
        <div className="flex-1 flex items-center justify-center text-xs" style={{ color: "#ff3333" }}>
          Error: {error}
        </div>
      )}

      {!loading && !error && (
        <div className="flex-1 grid grid-cols-12 gap-px overflow-hidden" style={{ background: "#111" }}>

          {/* ── Left: indicators + Fed ────────────────────────── */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-px overflow-y-auto" style={{ background: "#080808" }}>

            {/* Macro indicators */}
            <div className="panel" style={{ border: "none" }}>
              <div className="panel-hdr">Macro Indicators</div>
              <table className="bb-table">
                <thead>
                  <tr>
                    <th>Indicator</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">1D Chg</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(grouped).map(([group, items]) => (
                    <Fragment key={group}>
                      <tr>
                        <td colSpan={3}
                          className="text-[8px] tracking-widest uppercase pt-2 pb-0.5 font-bold"
                          style={{
                            color: "#ff8c00",
                            textShadow: "0 0 6px rgba(255,140,0,0.3)",
                            borderLeft: "2px solid rgba(255,140,0,0.3)",
                            paddingLeft: 8,
                          }}>
                          {group}
                        </td>
                      </tr>
                      {items.map(({ key }) => {
                        const ind: MacroIndicator | undefined = data.indicators[key];
                        const chg = fmtChange(ind?.change ?? null, ind?.change_pct ?? null);
                        return (
                          <tr key={key}>
                            <td style={{ color: "#555" }}>{ind?.name ?? key}</td>
                            <td className="text-right font-mono font-bold" style={{ color: "#ccc" }}>
                              {ind ? fmtVal(ind.price, key) : "—"}
                            </td>
                            <td className="text-right font-mono text-[10px] font-bold"
                              style={{ color: chg.hex, textShadow: `0 0 5px ${chg.hex}50` }}>
                              {chg.text}
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Fed liquidity */}
            <div className="panel flex-1" style={{ border: "none" }}>
              <div className="panel-hdr">Fed Liquidity</div>
              {data.fed_balance_sheet ? (
                <FedLiquidityPanel fed={data.fed_balance_sheet} />
              ) : (
                <div className="px-3 py-3 space-y-2">
                  <div className="text-[10px]" style={{ color: "#444" }}>
                    Add <span style={{ color: "#ff8c00" }}>FRED_API_KEY</span> to backend .env for live Fed balance sheet data.
                  </div>
                  <div className="text-[9px]" style={{ color: "#2a2a2a" }}>
                    Free key at fred.stlouisfed.org — tracks total assets, reverse repo, TGA, M2.
                  </div>
                  <LiquidityNote />
                </div>
              )}
            </div>
          </div>

          {/* ── Right: news ───────────────────────────────────── */}
          <div className="col-span-12 lg:col-span-8 flex flex-col overflow-hidden" style={{ background: "#060606" }}>
            <div className="panel h-full flex flex-col" style={{ border: "none" }}>
              <div className="panel-hdr">
                <span>Market News</span>
                <span className="normal-case font-normal text-[9px]" style={{ color: "#333" }}>
                  {data.news.length} headlines · Reuters · MarketWatch · CNBC
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {data.news.length === 0 ? (
                  <div className="px-3 py-8 text-xs text-center" style={{ color: "#333" }}>
                    No news loaded — RSS feeds may be temporarily unavailable.
                  </div>
                ) : (
                  data.news.map((item: NewsItem, i: number) => (
                    <NewsRow key={i} item={item} />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
