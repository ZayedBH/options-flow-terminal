export function fmtPrice(v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toFixed(dp);
}

export function fmtBig(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3)  return `${sign}${(abs / 1e3).toFixed(2)}K`;
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
  if (!regime) return "text-bb-muted";
  const r = regime.toLowerCase();
  if (r.includes("strong bullish")) return "text-bb-green";
  if (r.includes("bullish"))        return "text-[#66e090]";
  if (r.includes("strong bearish")) return "text-bb-red";
  if (r.includes("bearish"))        return "text-[#ff7777]";
  if (r.includes("expansion"))      return "text-bb-orange";
  if (r.includes("compression"))    return "text-bb-cyan";
  if (r.includes("long gamma"))     return "text-bb-cyan";
  if (r.includes("short gamma"))    return "text-bb-orange";
  return "text-bb-text";
}

export function biasColor(bias: string | undefined): string {
  return regimeColor(bias);
}

export function sideColor(side: string | undefined): string {
  if (side === "bullish") return "text-bb-green";
  if (side === "bearish") return "text-bb-red";
  return "text-bb-muted";
}
