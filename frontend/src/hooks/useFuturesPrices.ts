import { useEffect, useState } from "react";
import { fetchFuturesPrices } from "../api/client";

export interface FuturesPrices {
  "ES=F": number | null;
  "NQ=F": number | null;
}

export function useFuturesPrices(): FuturesPrices {
  const [prices, setPrices] = useState<FuturesPrices>({ "ES=F": null, "NQ=F": null });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchFuturesPrices();
        if (!cancelled) {
          setPrices({
            "ES=F": data["ES=F"] ?? null,
            "NQ=F": data["NQ=F"] ?? null,
          });
        }
      } catch {
        // silently ignore — FOOTS just won't show if futures unreachable
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return prices;
}

/** Given an underlying symbol, return which futures contract it maps to. */
export function futuresForSymbol(underlying: string): keyof FuturesPrices | null {
  const u = underlying.toUpperCase();
  if (u === "QQQ") return "NQ=F";
  if (u === "SPY" || u === "SPX" || u === "ES=F") return "ES=F";
  return null;
}
