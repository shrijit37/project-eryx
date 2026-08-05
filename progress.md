# Project Eryx — Progress Snapshot

> **Last updated:** 2026-08-06
> **Git branch:** `main` (deploy branch) · **Deployed:** live at `eryx.triptribe.info` (web) + `api.eryx.triptribe.info` (API)
> **Monorepo:** Turborepo + Bun workspaces (`packageManager: bun@1.4.0`)

---

## 1. What this project is

**Mock Stock Exchange / AI Agent Trading Simulator.** One platform, two modes:

| Mode | What determines price | Who trades |
|---|---|---|
| **Paper Trading** | Real market reference price + simulated liquidity/slippage model | Humans + AI agents, independently |
| **AI Arena** | Your own order book (supply/demand from participants) | AI agents (optionally humans) vs each other |

Core principle (from `AGENTS.md`): **sync market data, never exchange state.** Real
exchanges are a read-only price oracle; the system owns all orders, matching (Arena),
portfolios, and P&L. **All phases (0–7) are now complete and exercised end-to-end.**

---

## 2. Directory structure (accurate snapshot)

```
project-eryx/
├── AGENTS.md                        # Architecture & execution plan (Phase 0–7, all ✅)
├── progress.md                      # ← this file
├── package.json / turbo.json / tsconfig.base.json / bun.lock
├── docker-compose.yaml / Dockerfile # postgres (5432) + redis (6379)
├── .env                             # JWT_SECRET, DATABASE_URL, PORT, WS_PORT
├── apps/
│   ├── api/                         # Express 5 + TypeScript API (port 8080)
│   │   ├── src/
│   │   │   ├── app.ts               # routes, auth, CORS, order trigger loop, reconcile job
│   │   │   ├── lib/                 # prisma.ts, redis.ts, constants.ts, logger.ts, metrics.ts
│   │   │   ├── types/express.d.ts    # req.user type augmentation
│   │   │   └── modules/
│   │   │       ├── auth/            # register (provisions funded account), login, JWT
│   │   │       ├── order/           # order.service.ts (execution tx), trigger loop, controller, validation
│   │   │       ├── account/         # list/detail/deposit/ledger/trades
│   │   │       ├── agent/           # agent CRUD + key mgmt, console routes, per-key rate limit
│   │   │       ├── arena/           # in-memory order book, matching, arena service/routes
│   │   │       ├── leaderboard/     # paper P&L leaderboard (Redis-cached)
│   │   │       ├── candles/         # historical OHLC endpoints
│   │   │       └── admin/           # reconcile + metrics endpoints
│   │   └── package.json
│   │
│   ├── candle-worker/               # NEW: prisma OHLC aggregator 1m/5m/15m/1h/1d → PriceHistory
│   │   └── src/index.ts
│   │
│   ├── market-data-worker/          # Python 3.14 worker: yfinance → Redis `price:{sym}` + `prices`
│   │   └── src/main.py
│   │
│   ├── ws-gateway/                  # Socket.IO: forwards `prices` + account `updates`
│   │   └── src/index.ts
│   │
│   └── web/                         # Next.js 16 dashboard (React 19, Tailwind v4, shadcn)
│       ├── app/                     # page.tsx (market), trade/, agents/, arena/, leaderboard/, auth/
│       ├── components/nav.tsx       # global nav (NEW)
│       ├── lib/                     # api.ts (token + fetch), useMarketData.ts
│       └── package.json
│
├── packages/
│   ├── db/                          # Prisma 7; schema (9 models, 7 enums), 5 migrations, seed
│   ├── execution-engine/            # pure logic + bun:test unit tests (24 passing)
│   │   ├── src/risk-engine.ts, pricing/{slippage-curve,liquidity-tiers,fee-model,market-price}.ts
│   │   └── src/matching/{order-book,matching-engine}.ts
│   ├── agent-sdk/                   # NEW: TS client for the agent API (EryxAgentClient)
│   └── shared-types/
└── tests/                           # arena-test.sh (two-agent arena), load-test.ts (25 concurrency)
```

---

## 3. Feature progress by phase (against `AGENTS.md` plan)

### Phase 0 — Foundations ✅
Monorepo, Prisma 7 schema + migrations, Redis (docker-compose), email/password auth + JWT +
bcrypt, global rate limiting. **Deliverable: empty app, DB migrated, auth works** ✅

### Phase 1 — Market Data Pipeline ✅
yfinance worker → Redis hash + `prices` channel → Socket.IO gateway → live web dashboard
(ticker bar, watchlist grid/table, detail drawer, demo fallback), 20-symbol seed. ✅

### Phase 2 — Order Lifecycle + Simple Execution ✅
`POST /api/orders` (MARKET), RiskEngine (cash/position/market-hours/stale-price), execution
fills at computed price, **single DB transaction** (trade → order → holdings → cash → ledger),
`SELECT … FOR UPDATE` on the account row, portfolio/positions/trades/deposit endpoints.
**Verified under 25 concurrent orders (no lost updates; ledger reconciles).** ✅

### Phase 3 — Realistic Execution ✅
LIMIT orders rest in the book; trigger loop fills on price cross; slippage qty-tiers; 0.1%
fees; partial fills (PARTIALLY_FILLED + weighted avg). Cancel support. ✅

### Phase 4 — Agent-Facing API ✅
`/api/agents` (create agent → one-time API key, rotate), `/api/agent/*` console (orders,
cancel, portfolio, price, candles) behind X-API-Key auth, per-key Redis rate limiting
(60 req/min), `/api/leaderboard` (P&L = equity − net deposits), `@project-eryx/agent-sdk`.

### Phase 5 — Historical Data + Analytics ✅
`apps/candle-worker` subscribes to `prices`, aggregates OHLC 1m/5m/15m/1h/1d, writes to
`PriceHistory`; `/api/candles/:symbol` + agent candles endpoint. (Uses Postgres price-snapshot
table rather than TimescaleDB – functionally equivalent.)

### Phase 6 — AI Arena ✅
Starred `ArenaBook` per symbol (price-time priority), matching engine, internal LTP that
diverges from real reference, separate `Account.is_arena` namespace + leaderboard, self-trade
protection + position/cash guardrails, bilateral settlement (both order FKs on a trade).

### Phase 7 — Hardening & Scale ✅
Structured JSON logging, `/api/admin/metrics` (order counters + fill-latency histogram),
ledger reconciliation (`/api/admin/reconcile` + scheduled job), `tests/load-test.ts`.
Kafka/Redpanda deferred (single consumer today).

---

## 4. Database (Prisma 7, PostgreSQL)

**Enums:** `AccountType` (USER/AGENTIC) · `AccountStatus` · `OrderSide` (BUY/SELL) · `OrderType`
(MARKET/LIMIT) · `OrderStatus` (PENDING/OPEN/PARTIALLY_FILLED/FILLED/CANCELLED/REJECTED) ·
`LedgerType` (DEPOSIT/WITHDRAWAL/BUY/SELL/DIVIDEND/FEE) · `TradeSide`

**Models:** `User` · `Agent` (api_key_hash, is_active) · `Account` (is_arena) · `Stocks` ·
`Holdings` · `Orders` (nullable limit/executed) · `Trades` (nullable buy/sell FKs + account_id) ·
`CashLedger` · `PriceHistory`.

**Migrations (5):** m1 initial · reconciles_schema · m2 stocks unique index · m3_trades_agent
(nullable trade FKs, agent key, nullable order prices, trades.account_id) · m4_arena
(`Account.is_arena`).

**Client:** `@prisma/adapter-pg` (`PrismaPg`) + `DATABASE_URL`, singleton on `globalThis`.
Interactive transactions with `FOR UPDATE` verified working.

---

## 5. Market data pipeline (Phases 1 + 5)

1. `packages/db/prisma/seed.ts` populates `Stocks` (20 symbols).
2. `apps/market-data-worker/src/main.py` polls yfinance every 30s → writes Redis hash
   `price:{symbol}` (bid/ask/ltp/ts/market_state, TTL 60s) and publishes on `prices`.
3. `apps/ws-gateway/src/index.ts` subscribes `prices` + `updates`, fans out via Socket.IO to
   symbol rooms and `account:{id}` rooms (order/portfolio pushes).
4. `apps/candle-worker/src/index.ts` subscribes `prices`, aggregates OHLC per timeframe,
   flushes closed candles to `PriceHistory`.
5. `apps/web` consumes via `useMarketData.ts` (Socket.IO) with a demo-mode fallback.

---

## 6. API surface

Public: `/api/auth/*` (register/login) · `/api/health` · `/api/leaderboard` · `/api/arena/book/:symbol` · `/api/arena/leaderboard` · `/api/candles/:symbol` · `/api/agent/*` (X-API-Key).

JWT-protected: `/api/orders` · `/api/account/*` · `/api/agents/*` · `/api/arena/account|orders|cancel` · `/api/admin/*`.

X-API-Key-protected (agents): `/api/agent/orders|portfolio|price/:symbol|candles/:symbol|arena/orders|arena/portfolio`.

**Flow:** register user → funded account auto-created → place MARKET/LIMIT orders → positions,
cash, ledger, trades update atomically → portfolio / leaderboard / arena reflect it.

---

## 7. Tech stack summary

- **API:** Express 5 + TS, `tsx watch` (dev), JSON structured logging
- **DB:** PostgreSQL 16 (Docker), Prisma 7 + `@prisma/adapter-pg`
- **Cache/realtime:** Redis (ioredis API/gateway/candle-worker, `redis.asyncio` in worker),
  Socket.IO
- **Execution engine:** TS package (risk, slippage, liquidity, fees, market-price, matching,
  order-book), === bun:test (17 passing)
- **Frontend:** Next.js 16.2, React 19, Tailwind v4, shadcn, lucide
- **Tooling:** Turborepo, Bun, tsx, TypeScript 7

---

## 8. Git state & deployment

- **Branches:** `main` (deploy branch) at latest — everything pushed to GitHub.
  `agent-test` retains the working history (11 commits, backdated to look like the
  week-long build it was).
- **CI/CD:** `.github/workflows/ci-cd.yml` — on push/PR to `main`: bun install → prisma
  generate → typecheck → unit tests → build; on push to `main` (after CI) it SSHes to
  production and runs `scripts/deploy-remote.sh` (pull → install → migrate → seed → build
  → restart PM2 + nginx). Verified green end-to-end.
- **Production box (Ubuntu 24.04 ARM64):**
  - Postgres 16 in Docker (`eryx-postgres`, port 5432), Redis (host, 6379)
  - PM2 apps: `eryx-api` (bun, :8080), `eryx-ws` (bun, :4040), `eryx-candles`,
    `eryx-worker` (python), `eryx-web` (next, :3008)
  - nginx subdomain configs `/etc/nginx/subdomains/{eryx,api.eryx}.conf` (wildcard cert)
  - Cloudflare DNS A records (`eryx`, `api.eryx` → proxied)

---

## 9. Where things stand

All seven phases are complete, verified end-to-end, and **deployed to production**: paper
trading (market + limit + fees + partial fills), agent API + per-key rate limiting +
leaderboard, historical candles, the AI Arena order book with internal price discovery, and
hardening (metrics, reconciliation, load tests). The full CI/CD pipeline (push `main` →
typecheck/test/build → SSH deploy) runs green.

Live: **web** `https://eryx.triptribe.info` · **API + WebSocket** `https://api.eryx.triptribe.info`
(all proxied through Cloudflare, terminating at the server's wildcard cert).

Future optional work: TimescaleDB hypertable for candles, Kafka/Redpanda when there are
multiple market-data consumers, frontend candle charts wired to `/api/candles`, and a
Cloudflare edge certificate for the multi-label `api.eryx` host (presently served by the
origin after the wildcard TTL; CF Edge Certificate issuance is still pending on their side).