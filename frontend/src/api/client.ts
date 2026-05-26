import type { FlowEvent, GEXHistoryPoint, TerminalSnapshot } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const WS_BASE = import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:8000";

export async function fetchSymbols(): Promise<{
  equity_index: string[];
  futures: string[];
}> {
  const r = await fetch(`${API_BASE}/symbols`);
  if (!r.ok) throw new Error(`symbols ${r.status}`);
  return r.json();
}

export async function fetchSnapshots(): Promise<TerminalSnapshot[]> {
  const r = await fetch(`${API_BASE}/snapshots`);
  if (!r.ok) throw new Error(`snapshots ${r.status}`);
  return r.json();
}

export async function fetchSnapshot(symbol: string): Promise<TerminalSnapshot> {
  const r = await fetch(`${API_BASE}/snapshot/${symbol}`);
  if (!r.ok) throw new Error(`snapshot ${r.status}`);
  return r.json();
}

export async function fetchFlow(symbol: string, limit = 100): Promise<FlowEvent[]> {
  const r = await fetch(`${API_BASE}/flow/${symbol}?limit=${limit}`);
  if (!r.ok) throw new Error(`flow ${r.status}`);
  return r.json();
}

export async function fetchMacro(): Promise<Record<string, unknown>> {
  const r = await fetch(`${API_BASE}/macro`);
  if (!r.ok) throw new Error(`macro ${r.status}`);
  return r.json();
}

export async function fetchFuturesPrices(): Promise<Record<string, number | null>> {
  const r = await fetch(`${API_BASE}/futures-prices`);
  if (!r.ok) throw new Error(`futures-prices ${r.status}`);
  return r.json();
}

export async function fetchGEXHistory(symbol: string): Promise<GEXHistoryPoint[]> {
  const r = await fetch(`${API_BASE}/history/${symbol}`);
  if (!r.ok) throw new Error(`history ${r.status}`);
  return r.json();
}

export function wsUrl(): string {
  return `${WS_BASE}/ws`;
}
