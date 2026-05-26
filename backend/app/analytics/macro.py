"""Macro data: Fed balance sheet, rates, FX, commodities, and news from free RSS feeds."""
from __future__ import annotations

import asyncio
import time
import xml.etree.ElementTree as ET
from datetime import datetime, UTC

import httpx

MACRO_SYMBOLS: dict[str, str] = {
    "^TNX":     "US 10Y Yield",
    "^TYX":     "US 30Y Yield",
    "^FVX":     "US 5Y Yield",
    "^IRX":     "US 3M T-Bill",
    "DX-Y.NYB": "DXY Index",
    "GC=F":     "Gold",
    "CL=F":     "WTI Crude",
    "SI=F":     "Silver",
    "BTC-USD":  "Bitcoin",
    "^VIX":     "VIX",
    "^VVIX":    "VIX of VIX",
    "^VXN":     "Nasdaq VIX",
}

NEWS_FEEDS: list[tuple[str, str]] = [
    ("Reuters",    "https://feeds.reuters.com/reuters/businessNews"),
    ("MarketWatch","https://feeds.marketwatch.com/marketwatch/topstories/"),
    ("CNBC",       "https://www.cnbc.com/id/100003114/device/rss/rss.html"),
]

# (series_id, label, scale_to_billions)
# WALCL/WTREGEN are in millions → ×0.001; RRPONTSYD/M2SL are already in billions
FRED_SERIES: dict[str, tuple[str, float]] = {
    "WALCL":     ("Fed Total Assets",      0.001),
    "RRPONTSYD": ("Overnight Reverse Repo", 1.0),
    "WTREGEN":   ("Treasury General Acct", 0.001),
    "M2SL":      ("M2 Money Supply",        1.0),
}

_cache_ts: float = 0.0
_cached: dict | None = None
_CACHE_TTL = 300  # 5 minutes


async def get_macro_snapshot(adapter, fred_api_key: str | None = None) -> dict:
    global _cache_ts, _cached
    if time.time() - _cache_ts < _CACHE_TTL and _cached:
        return _cached

    indicators_task = _fetch_indicators(adapter)
    news_task = _fetch_news()
    fed_task = _fetch_fed(fred_api_key)
    fg_task = _fetch_fear_greed()

    indicators, news, fed, fear_greed = await asyncio.gather(
        indicators_task, news_task, fed_task, fg_task, return_exceptions=True
    )

    result = {
        "indicators": indicators if isinstance(indicators, dict) else {},
        "news": news if isinstance(news, list) else [],
        "fed_balance_sheet": fed if isinstance(fed, dict) else None,
        "fear_greed": fear_greed if isinstance(fear_greed, dict) else None,
        "timestamp": datetime.now(UTC).isoformat(),
    }
    _cached = result
    _cache_ts = time.time()
    return result


async def _fetch_indicators(adapter) -> dict:
    import yfinance as yf

    async def _one(symbol: str, name: str) -> tuple[str, dict]:
        try:
            price, change, change_pct = await asyncio.to_thread(_price_and_change, symbol)
            return symbol, {"name": name, "symbol": symbol, "price": price,
                           "change": change, "change_pct": change_pct}
        except Exception:
            return symbol, {"name": name, "symbol": symbol, "price": None,
                           "change": None, "change_pct": None}

    def _price_and_change(symbol: str) -> tuple[float | None, float | None, float | None]:
        t = yf.Ticker(symbol)
        hist = t.history(period="5d")
        if hist.empty or len(hist) < 2:
            fi = t.fast_info
            price = getattr(fi, "last_price", None) or getattr(fi, "regular_market_price", None)
            return price, None, None
        closes = hist["Close"].dropna()
        if len(closes) < 2:
            return float(closes.iloc[-1]), None, None
        curr = float(closes.iloc[-1])
        prev = float(closes.iloc[-2])
        chg = curr - prev
        chg_pct = (chg / prev * 100) if prev else None
        return curr, chg, chg_pct

    tasks = [_one(sym, name) for sym, name in MACRO_SYMBOLS.items()]
    pairs = await asyncio.gather(*tasks)
    return dict(pairs)


async def _fetch_news(limit: int = 30) -> list[dict]:
    items: list[dict] = []
    headers = {"User-Agent": "Mozilla/5.0 (compatible; OFT/1.0)"}
    async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
        for source, url in NEWS_FEEDS:
            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    parsed = _parse_rss(resp.text, source)
                    items.extend(parsed[:12])
            except Exception:
                pass
    items.sort(key=lambda x: x.get("published", ""), reverse=True)
    return items[:limit]


def _parse_rss(xml_text: str, source: str) -> list[dict]:
    out: list[dict] = []
    try:
        root = ET.fromstring(xml_text)
        for item in root.findall(".//item"):
            title = (item.findtext("title") or "").strip()
            link  = (item.findtext("link")  or "").strip()
            pub   = (item.findtext("pubDate") or "").strip()
            desc  = (item.findtext("description") or "").strip()
            if not title:
                continue
            # strip HTML tags from description
            import re
            desc = re.sub(r"<[^>]+>", "", desc)[:200]
            out.append({"title": title, "url": link, "source": source,
                        "published": pub, "summary": desc or None})
        if not out:
            # Atom feeds
            atom = "http://www.w3.org/2005/Atom"
            for entry in root.findall(f"{{{atom}}}entry"):
                title = (entry.findtext(f"{{{atom}}}title") or "").strip()
                link_el = entry.find(f"{{{atom}}}link")
                link = link_el.get("href", "") if link_el is not None else ""
                pub  = (entry.findtext(f"{{{atom}}}published") or "").strip()
                summ = (entry.findtext(f"{{{atom}}}summary") or "").strip()
                import re
                summ = re.sub(r"<[^>]+>", "", summ)[:200]
                if title:
                    out.append({"title": title, "url": link, "source": source,
                                "published": pub, "summary": summ or None})
    except Exception:
        pass
    return out


async def _fetch_fed(fred_api_key: str | None) -> dict | None:
    if not fred_api_key:
        return None
    result: dict = {}
    async with httpx.AsyncClient(timeout=10) as client:
        for series_id, (label, scale) in FRED_SERIES.items():
            try:
                url = (
                    f"https://api.stlouisfed.org/fred/series/observations"
                    f"?series_id={series_id}&api_key={fred_api_key}"
                    f"&limit=4&sort_order=desc&file_type=json"
                )
                resp = await client.get(url)
                if resp.status_code != 200:
                    continue
                obs = resp.json().get("observations", [])
                if not obs:
                    continue
                raw  = _safe_float(obs[0]["value"])
                prev_raw = _safe_float(obs[1]["value"]) if len(obs) > 1 else None
                # Normalize to billions of USD
                val  = raw  * scale if raw  is not None else None
                prev = prev_raw * scale if prev_raw is not None else None
                result[series_id] = {
                    "label": label,
                    "value_bn": val,   # always in $billions
                    "date":  obs[0]["date"],
                    "change_bn": (val - prev) if val is not None and prev is not None else None,
                }
            except Exception:
                pass
    return result if result else None


def _safe_float(v) -> float | None:
    try:
        f = float(v)
        return None if f != f else f  # NaN check
    except (TypeError, ValueError):
        return None


async def _fetch_fear_greed() -> dict | None:
    """CNN Fear & Greed Index — free, no API key required."""
    url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; OFT/1.0)",
        "Referer": "https://www.cnn.com/markets/fear-and-greed",
    }
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                return None
            data = resp.json()
            fg = data.get("fear_and_greed", {})
            score = _safe_float(fg.get("score"))
            rating = str(fg.get("rating", "")).strip()
            if score is None:
                return None
            return {
                "score": round(score, 1),
                "rating": rating,
                "timestamp": str(fg.get("timestamp", "")),
            }
    except Exception:
        return None
