
# Mock Stock Exchange / AI Agent Trading Simulator — Architecture & Execution Plan

## 0. Product Framing

Two modes, one platform:

|Mode|What determines price|Who trades|
|---|---|---|
|**Paper Trading Mode**|Real market reference price + simulated liquidity/slippage model|Humans + AI agents, independently|
|**AI Arena Mode**|Your own order book (supply/demand from participants)|AI agents (and optionally humans) vs each other|

Core principle: **sync market data, never exchange state.** Real exchanges are a read-only price oracle. Your system owns all orders, matching (in Arena mode), portfolios, and P&L.

Recommended build order: Paper Trading Mode first (Level 1 → Level 2 realism), then AI Arena Mode (Level 3) once the core ledger/execution primitives are solid.

---

## 1. Tech Stack

Chosen to match a stack you're already fluent in (same shape as ReviewRabbit):

- **API layer:** Node.js + TypeScript + express
- **Frontend:** Next.js (dashboard, charts, agent leaderboard)
- **Primary DB:** PostgreSQL (orders, trades, positions, cash ledger, users/agents — needs ACID transactions)
- **Cache / real-time state:** Redis (latest bid/ask, order book snapshots, session data, leaderboard)
- **Time-series (phase 2+):** TimescaleDB (add-on to Postgres) for ticks/candles/historical data — avoids introducing a second DB engine early
- **Job queue:** BullMQ + Redis (for async settlement, EOD jobs, agent scheduling)
- **Realtime transport:** WebSockets (native `ws` or express websocket plugin) for price ticks and order/portfolio updates
- **Event backbone:** none initially. Introduce Kafka/Redpanda only in Phase 4+ when you have multiple independent consumers of market data (candle engine, analytics, multiple execution shards)
- **Market data source:** a free/cheap real-time or delayed quotes API (e.g. Finnhub, Twelve Data, Alpha Vantage, or NSE/BSE delayed feeds if you want Indian equities) — pick based on rate limits and asset coverage, not name recognition

---

## 2. High-Level Architecture (Phase 1–2 target)

```
                         REAL MARKET DATA PROVIDER
                                    │  WS / REST
                                    ▼
                        ┌────────────────────────┐
                        │  Market Data Ingestor   │  (Node worker, always-on)
                        └───────────┬─────────────┘
                                    │ normalize + validate
                                    ▼
                        ┌────────────────────────┐
                        │        Redis           │
                        │  latest bid/ask/LTP    │
                        └───────────┬─────────────┘
                       ┌────────────┼───────────────┐
                       ▼            ▼               ▼
               WebSocket Gateway  Candle Worker   Execution Engine
                (push to clients)  (OHLC → TimescaleDB)   (pulled on order)


  CLIENTS (Web app / AI agents via API key)
            │
            ▼
     API Gateway (express)
            │
     ┌──────┼───────────────┐
     ▼      ▼               ▼
  Auth   Agent API      Order Service
                              │
                              ▼
                         Risk Engine
                    (cash? position limits?
                     market open? rate limit?)
                              │
                              ▼
                       Execution Engine ◄──── reads Redis price + liquidity model
                              │
                              ▼
                    PostgreSQL TRANSACTION
                    ├── insert trade
                    ├── update order status
                    ├── update position
                    ├── update cash balance
                    └── insert ledger entry
                              │
                              ▼
                    Portfolio / Positions / Trades
                         (read APIs + WS push)
```

---

## 3. Core Data Model (PostgreSQL)

```
users            (id, email, auth info, created_at)
agents           (id, user_id, name, api_key_hash, status, created_at)
accounts         (id, owner_id [user or agent], cash_balance, currency, created_at)
instruments      (symbol, exchange, name, tick_size, lot_size, is_active)
orders           (id, account_id, symbol, side, type, qty, limit_price,
                  status, created_at, updated_at)
trades           (id, order_id, account_id, symbol, qty, price, fees, executed_at)
positions        (account_id, symbol, qty, avg_price, updated_at)  -- unique(account_id, symbol)
cash_ledger      (id, account_id, type[DEPOSIT/TRADE/FEE], amount, balance_after, ref_id, created_at)
price_snapshots  (symbol, bid, ask, ltp, ts)                        -- optional, Redis is primary
candles          (symbol, interval, open, high, low, close, volume, ts)  -- TimescaleDB hypertable, phase 2+
```

Non-negotiable rule: **trade execution is one DB transaction.** Insert trade → update order → update position → update cash → insert ledger entry, all-or-nothing. This is the one place correctness matters more than speed.

---

## 4. Execution Engine — the core loop

```
1. Order received (validated schema, authenticated agent/user)
2. Risk Engine checks:
   - market open (per instrument trading hours)
   - sufficient cash (BUY) or sufficient position (SELL)
   - position/exposure limits per account
   - rate limit per agent (protect against runaway bots)
3. Fetch reference price from Redis (bid/ask/LTP)
4. Apply liquidity/slippage model to compute fill price(s)
   - qty tiers: small qty ≈ near touch price; large qty ≈ walks the book synthetically
   - add configurable spread + random micro-slippage + fee %
5. Begin Postgres transaction:
   - insert trade(s) (support partial fills as multiple trade rows against 1 order)
   - update order.status (FILLED / PARTIALLY_FILLED / REJECTED)
   - upsert position (recompute avg_price, qty)
   - debit/credit cash_ledger + accounts.cash_balance
6. Commit. Publish order_update + portfolio_update over WebSocket.
```

You do **not** need real supply/demand modeling in Paper Trading Mode — the real market has already done price discovery for you. You only need a **liquidity/slippage model** so large synthetic orders don't fill unrealistically at a single tick price. Example curve:

```
qty ≤ 100        → fill at touch price ± tiny slippage
100 < qty ≤ 10k   → fill at touch price ± 0.05–0.15%
qty > 10k         → escalating slippage or partial reject
```

---

## 5. Phase-Wise Execution Plan

### Phase 0 — Foundations (0.5–1 week)

- Repo scaffold: express API + Next.js frontend in a monorepo (pnpm workspaces or Turborepo)
- Postgres schema + migrations (Prisma or Drizzle — pick one, Drizzle is lighter for this kind of financial schema work)       :✅
- Redis running locally (Docker Compose) :✅
- Auth: simple email/password or magic link for users; API-key issuance flow for agents ✅
- **Deliverable:** empty app, DB migrated, auth works, agent can obtain an API key ✅

### Phase 1 — Market Data Pipeline (Level 1 simulator, ~1 week)

- Market Data Ingestor worker: connects to chosen provider (WS if available, else polling REST every N seconds), normalizes payload to internal shape `{symbol, bid, ask, ltp, ts}`  ✅
- Write latest price into Redis (`price:{symbol}` hash)  ✅
- WebSocket Gateway: pushes price updates to subscribed frontend clients  || frontend part not done yet 
- Basic instruments table seeded with a fixed watchlist (start with 10–20 liquid symbols, not the whole market)  ✅
- **Deliverable:** live prices visible on a simple dashboard for a fixed symbol list ✅

### Phase 2 — Order Lifecycle + Simple Execution (Level 1→2, ~1–1.5 weeks)

- Order Service: POST /orders (MARKET orders only to start)
- Risk Engine: cash check, market-hours check
- Execution Engine: fill at current ask/bid (no slippage model yet) — get the transactional plumbing rock solid first
- Portfolio Service: positions, cash balance, trade history endpoints
- **Deliverable:** a user or agent can place a market order and see portfolio update correctly, with correct DB consistency under concurrent orders (test this explicitly — concurrent BUY/SELL race conditions on the same account are the highest-risk bug class here)

### Phase 3 — Realistic Execution (Level 2, ~1 week)

- Add LIMIT order type + basic order queuing (limit orders wait until price crosses)
- Add slippage/liquidity model (qty-tiered as above)
- Add trading fees (flat % or per-share)
- Add partial fills
- **Deliverable:** execution behaves like a real broker — spread-aware, size-aware, fee-aware

### Phase 4 — Agent-Facing API + Sandbox Ergonomics (~1 week)

- Stable REST API for agents: place/cancel orders, get portfolio, get price, get historical candles
- Rate limiting per agent key
- Leaderboard (P&L ranking) cached in Redis
- Optional: a simple SDK/wrapper (TS or Python) so agents can be scripted quickly — good fit for your existing interest in agent tooling
- **Deliverable:** an external AI agent (e.g. a script calling your API) can run a full trading loop unattended

### Phase 5 — Historical Data + Analytics (~1 week, can run parallel to Phase 4)

- Introduce TimescaleDB hypertable for candles
- Candle Worker consumes Redis price stream (or Postgres NOTIFY, or Kafka if you're already there) and aggregates OHLC per interval
- Historical charting endpoints for frontend
- **Deliverable:** price charts with real historical candles, not just live ticks

### Phase 6 — AI Arena Mode (Level 3, the interesting part, ~2–3 weeks)

- Build an actual order book per symbol (price-time priority)
- Matching Engine: limit orders rest in the book; market orders sweep it; trades generate real internal price movement
- Decide whether Arena Mode runs on real reference prices as a _starting_ price only, then diverges based on internal supply/demand, or resets periodically to reference price
- Separate account/leaderboard namespace so Arena P&L isn't mixed with Paper Trading P&L
- **Deliverable:** multiple AI agents can trade against each other and move the internal price independently of the real market

### Phase 7 — Hardening & Scale (ongoing)

- Introduce Kafka/Redpanda if you need multiple independent consumers of market data at scale
- Add proper observability (structured logs, metrics on order latency, fill rates)
- Add audit trail / immutable ledger checks (periodic reconciliation job: sum of ledger entries == account balance)
- Load-test the Execution Engine under concurrent agent load specifically, since that's where race conditions live

---

## 6. Key Risks to Design Around Early

1. **Concurrency on the same account** — two orders from the same agent firing near-simultaneously must not corrupt cash/position state. Use row-level locking (`SELECT ... FOR UPDATE` on the account row) inside the execution transaction.
2. **Reference price staleness** — if the market data feed drops, don't silently execute against a stale price. Add a max-age check on the Redis price before filling an order.
3. **Runaway agents** — rate limit per API key at the gateway, independent of the risk engine, so a buggy agent script can't hammer the order endpoint.
4. **Two sources of truth in Arena Mode** — be explicit about whether Arena price is anchored to real price or fully synthetic; don't let it silently drift into an undocumented state.

---

## 7. Suggested Repo Structure

```
mock-exchange/
├── apps/
│   ├── api/                # express API (auth, orders, portfolio, agent endpoints)
│   ├── market-data-worker/ # ingests + normalizes real market feed
│   ├── ws-gateway/          # pushes price + portfolio updates to clients
│   └── web/                 # Next.js frontend
├── packages/
│   ├── db/                  # Drizzle/Prisma schema + migrations
│   ├── shared-types/        # shared TS types (Order, Trade, Position, etc.)
│   └── execution-engine/    # pricing, slippage, matching logic (importable + unit-testable in isolation)
├── docker-compose.yml        # postgres, redis, timescaledb (later)
└── README.md
```

Keeping `execution-engine` as a standalone package makes it independently unit-testable without spinning up the whole API — worth doing from Phase 2 onward since this is the highest-stakes logic in the system.