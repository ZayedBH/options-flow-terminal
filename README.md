# Options Flow Terminal

An institutional-style options-flow trading terminal. Continuously analyzes
options flow, dealer positioning, Greeks, volatility, liquidity, and market
structure to classify the current market regime and produce directional bias
across intraday / daily / weekly horizons.

> Status: phase-1 end-to-end MVP. Free-tier data (yfinance) with a pluggable
> adapter interface — drop in Polygon Options Advanced, Unusual Whales, or
> dxFeed without changing the rest of the system.

## Features

**Analytics engine (backend)**
- Black-Scholes pricing + full Greeks (Delta, Gamma, Theta, Vega, Rho, Vanna,
  Charm, Vomma) with implied-vol solver
- Per-contract → per-strike → chain-level aggregation of GEX, DEX, Vega
  exposure, Vanna exposure, Charm exposure
- Dealer-state classification (`long_gamma` / `short_gamma`)
- Gamma flip level detection, call wall / put wall identification
- IV summary: ATM IV, IV rank, IV percentile, realized vol, 25Δ skew, term
  structure, vol-state classifier (compression / expansion / crush / normal)
- Flow tape: sweep / block / large / unusual classification with bid/ask side
  inference and volume/OI ratio filtering
- Rule-based regime classifier with 14 regime labels:
  Strong Bullish / Bullish / Bullish Chop / Neutral Chop / Bearish Chop /
  Bearish / Strong Bearish / Volatility Expansion / Volatility Compression /
  Dealer Long Gamma / Dealer Short Gamma / Mean Reversion / Trend
  Continuation / Liquidity Vacuum
- Outputs: intraday / daily / weekly bias, expected move (1d, 1w), sentiment
  score, gamma-squeeze risk, mean-reversion score, trend-continuation score,
  key levels, AI commentary

**Terminal UI (frontend)**
- Market Regime panel (bias + confidence + vol state + expected move)
- Dealer Positioning panel (net GEX / DEX / Vega / Vanna / Charm / flip / walls)
- GEX visualization (per-strike net GEX with dealer-side coloring + flip + spot)
- Options Flow Tape (bullish/bearish sweeps, blocks, unusual, premium-ranked)
- Volatility Dashboard (IV rank/percentile/skew + term-structure curve)
- Key Levels panel (gamma flip, walls, magnet strikes ranked by OI)
- AI Commentary panel (LLM-backed, with deterministic template fallback)
- Dark Pool panel (placeholder — requires paid feed)
- Live WebSocket updates with automatic reconnection

## Architecture

```
┌─ Data Adapters (pluggable) ──────────────────────────────────────────┐
│ yfinance | Polygon | Tradier | Unusual Whales | dxFeed | (CME for ES)│
└───────────────────────┬──────────────────────────────────────────────┘
                        │ normalized ChainSnapshot / FlowEvent
                        ▼
┌─ Analytics workers (Python + numpy/scipy) ───────────────────────────┐
│  Greeks engine → GEX/DEX/Vanna/Charm aggregator → Flow classifier    │
│  IV surface / skew / term structure → Regime classifier              │
└───────────────────────┬──────────────────────────────────────────────┘
                        ▼
┌─ State store + WebSocket fan-out ────────────────────────────────────┐
│  In-process snapshot cache + pub/sub queues per subscriber           │
└───────────────────────┬──────────────────────────────────────────────┘
                        ▼
┌─ FastAPI gateway ────────────────────────────────────────────────────┐
│  REST: /snapshot/{symbol}, /flow/{symbol}, /symbols, /config         │
│  WS:   /ws (initial state dump + live snapshot + flow updates)       │
└───────────────────────┬──────────────────────────────────────────────┘
                        ▼
┌─ React + TypeScript + Tailwind terminal UI ──────────────────────────┐
│  Regime Panel | Dealer Panel | GEX Chart | Flow Tape | IV Dashboard  │
│  Key Levels | AI Commentary | Dark Pool (placeholder)                │
└──────────────────────────────────────────────────────────────────────┘
```

## Free-tier limitations (read this before you ask why your tape is empty)

The free data tier (yfinance) gives end-of-day-ish options chains with 15-min
delay. It does **not** include:

- Real-time trade-conditions tape (so no true sweep/block detection — we
  approximate via volume/OI ratio + premium thresholds)
- FINRA dark-pool prints (the Dark Pool panel is a placeholder until you wire
  a paid feed)
- CME futures options chains (ES/NQ have placeholder hooks but no chain data
  on the free tier; switch DATA_PROVIDER to a CME-licensed source for full
  futures support)

To upgrade, get an API key for any of:

| Provider | Tier | Notes |
|---|---|---|
| Polygon.io | Options Advanced | Real-time OPRA WS + REST snapshots |
| Tradier | Brokerage | Quotes + chains, real-time with funded account |
| Unusual Whales | API | Flow + dark pool + dealer positioning |
| dxFeed | Pro | Full OPRA + CME, institutional-grade |

Then set `DATA_PROVIDER=polygon` (or `tradier`, etc.) and the corresponding
API key in `.env`.

## Quickstart (local docker-compose)

```bash
cp .env.example .env
docker compose up --build
```

Open the terminal at <http://localhost:5173> — the backend is at
<http://localhost:8000> (Swagger docs: `/docs`).

### Run without docker

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
DATA_PROVIDER=yfinance SYMBOLS=SPY,QQQ uvicorn app.main:app --reload

# Frontend (separate shell)
cd frontend
npm install
npm run dev
```

### Tests

```bash
cd backend && source .venv/bin/activate && pytest
```

20 tests cover the Black-Scholes engine (put-call parity, IV round-trip,
Greek signs/magnitudes), the GEX aggregator (dealer-state classification,
gamma-flip detection), flow filtering, regime classification, and the HTTP
API surface.

### Lint / typecheck

```bash
cd backend && ruff check .
cd frontend && npm run typecheck && npm run build
```

## API

| Method | Path | Description |
|---|---|---|
| GET | `/health` | liveness probe |
| GET | `/config` | active provider + symbols |
| GET | `/symbols` | configured equity/index and futures lists |
| GET | `/snapshots` | full snapshot for every tracked symbol |
| GET | `/snapshot/{symbol}` | latest snapshot (regime / GEX / IV / levels / flow / commentary) |
| GET | `/flow/{symbol}?limit=N` | last N notable flow events |
| WS | `/ws` | live `initial` + `snapshot` + `flow` messages |

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DATA_PROVIDER` | `yfinance` | adapter selection |
| `SYMBOLS` | `SPY,QQQ,SPX` | equity/index symbols to poll |
| `FUTURES_SYMBOLS` | `ES=F,NQ=F` | futures symbols (price-only on free tier) |
| `CHAIN_POLL_INTERVAL_SECONDS` | `60` | how often to refresh chains |
| `RISK_FREE_RATE` | `0.045` | r used for Greeks |
| `POLYGON_API_KEY` | _empty_ | required when `DATA_PROVIDER=polygon` |
| `OPENAI_API_KEY` | _empty_ | enables LLM commentary; template fallback otherwise |

## Roadmap

**Phase 2** — flow & vol depth
- Realtime tape via Polygon options WebSocket
- IV surface + skew time-series with historical context
- Dealer-pinning detection near expirations
- 0DTE-specific logic (charm decay zones, EOD acceleration)

**Phase 3** — institutional
- Dark pool integration (Unusual Whales / FINRA TRF feed)
- Cross-asset regime overlay (VIX/DXY/bonds/breadth)
- Vol surface model (SVI / SABR) instead of point IV
- Backtesting harness for regime signals

## License

Internal / TBD.
