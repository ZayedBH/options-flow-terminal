export function fmtPrice(v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toFixed(dp);
}

export function fmtBig(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(2)}K`;
  return `${sign}${abs.toFixed(2)}`;
}

export function fmtPct(v: number | null | undefined, dp = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(dp)}%`;
}

export function fmtPctOf100(v: number | null | undefined, dp = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(dp)}%`;
}

export function regimeColor(regime: string | undefined): string {
  if (!regime) return "text-zinc-400";
  if (regime.toLowerCase().includes("strong bullish")) return "text-emerald-400";
  if (regime.toLowerCase().includes("bullish")) return "text-green-400";
  if (regime.toLowerCase().includes("strong bearish")) return "text-rose-500";
  if (regime.toLowerCase().includes("bearish")) return "text-red-400";
  if (regime.toLowerCase().includes("expansion")) return "text-orange-300";
  if (regime.toLowerCase().includes("compression")) return "text-cyan-300";
  if (regime.toLowerCase().includes("long gamma")) return "text-cyan-300";
  if (regime.toLowerCase().includes("short gamma")) return "text-orange-300";
  return "text-zinc-300";
}

export function biasColor(bias: string | undefined): string {
  return regimeColor(bias);
}

export function sideColor(side: string | undefined): string {
  if (side === "bullish") return "text-terminal-bull";
  if (side === "bearish") return "text-terminal-bear";
  return "text-terminal-neutral";
}
