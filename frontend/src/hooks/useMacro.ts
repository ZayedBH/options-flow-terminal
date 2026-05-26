import { useEffect, useState } from "react";
import { fetchMacro } from "../api/client";

export interface MacroIndicator {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  change_pct: number | null;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  published: string;
  summary: string | null;
}

export interface FedSeries {
  label: string;
  value_bn: number | null;   // always in $billions
  date: string;
  change_bn: number | null;  // always in $billions
}

export interface FearGreed {
  score: number;
  rating: string;
  timestamp: string;
}

export interface MacroSnapshot {
  indicators: Record<string, MacroIndicator>;
  news: NewsItem[];
  fed_balance_sheet: Record<string, FedSeries> | null;
  fear_greed: FearGreed | null;
  timestamp: string | null;
}

const EMPTY: MacroSnapshot = {
  indicators: {},
  news: [],
  fed_balance_sheet: null,
  fear_greed: null,
  timestamp: null,
};

export function useMacro(): { data: MacroSnapshot; loading: boolean; error: string | null } {
  const [data, setData] = useState<MacroSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const raw = await fetchMacro();
        if (!cancelled) {
          setData(raw as unknown as MacroSnapshot);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return { data, loading, error };
}
