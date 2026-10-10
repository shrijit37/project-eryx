# STATE.md — project-eryx (stock-trading platform, Bun + Python workers)

Last verified: 2026-10-10, CI/CD run 38028406970 green, public
services serving the uniform `GET /health` contract.

## What it is
Bun workspace monorepo: `apps/api` (Express 5.x + Prisma, :8080),
`apps/ws-gateway` (Socket.IO relay, :4040), `apps/candle-worker`
(aggregation, :4100), `apps/market-data-worker` (Python yfinance
ingest, :4200), `apps/web` (Next.js SPA, :3008), `packages/db`
(Prisma). Market data is live via yfinance; brokerage/trading
mutations are paper-mode unless the owner wires real keys.
`apps/mobile` does not exist — nothing to skip.

## Production topology (Dokploy project `BBhocEXMJFpVIbjdYh8hM`, env `vwuphOCLdCkF-KCCmeGqs`)
| Service | App | Public URL | Health |
|---|---|---|---|
| web | `WkI9-9uejJrva_R_duQyJ` | https://project-eryx.shrijit.tech | ok, api:up |
| api | `KptvzEDpXqBYPPWIt4b-0` | https://api.project-eryx.shrijit.tech | ok, database:up, redis:up |
| ws | `_IKOkFsYjCgsuP-oIBo5I` | https://ws.project-eryx.shrijit.tech | ok, redis:up |
| candles | `tUAKiA1sGXxbnDXt_gKGk` | internal only (:4100) | via code, not probed |
| marketdata | `bwCM8Ghlviwm5Atl8Iino` | internal only (:4200) | via code, not probed |
| postgres | `3C-uP8nyF1h5hUhTFELyL` (postgres:18-alpine, external :15437) | internal only | via api check |
| redis | `sMPEAyMCZPEjnKF27kW9N` (redis:8-alpine) | internal only | via api/ws checks |

Images: `ghcr.io/shrijit37/project-eryx-{api,ws,candles,marketdata,web}:<sha>`,
multi-arch, built on GH Actions only. Secrets from Infisical prod
(`ERYX_DATABASE_URL[_EXTERNAL]`, `ERYX_FINNHUB_API_KEY`,
`ERYX_REDIS_PASSWORD`, vault `infisical-prod` assigned to the eryx env).
DNS A records for `project-eryx`, `api.project-eryx`, `ws.project-eryx`
→ 130.210.29.215. No `ws.project-eryx` before this migration (new).
Local `docker-compose.yml` (postgres:18-alpine, redis:8-alpine, no
passwords) is dev-only and untouched by the pipeline.

## Redis auth (the crash-loop, fixed 2026-10-10)
Dokploy-managed Redis enforces `AUTH`; all four backend clients
connected with host/port only → `NOAUTH` loop, api exited on
missing `DATABASE_URL` first, then redis `WRONGPASS`.
Fix: new `ERYX_REDIS_PASSWORD` secret (also as `ERYX_REDIS_URL`),
`password: process.env.REDIS_PASSWORD || undefined` in the three
ioredis constructors (`apps/api/src/lib/redis.ts`,
`apps/ws-gateway/src/index.ts`, `apps/candle-worker/src/index.ts`)
and `password=os.environ.get("REDIS_PASSWORD") or None` in
`apps/market-data-worker/src/main.py:connect_redis`. The managed
Redis password was rotated twice (first rotation never reached the
running container before the apps re-asserted env); lesson: rotate
secret → `redis.update` + `redis.deploy` → wait for container
restart → re-assert app env → redeploy apps, in that order.

## Needs owner keys
| Infisical key | Powers | Effect when placeholder |
|---|---|---|
| `ERYX_FINNHUB_API_KEY` (`REPLACE_ME_OWNER`) | live quotes/fundamentals | workers fall back to yfinance-only |
| ~~`ERYX_JWT_SECRET`~~ | removed: identity is now the shared auth service (`auth.shrijit.tech`), the browser holds the `.shrijit.tech` session cookie |

## Deliberately removed / kept
- Removed `dotenv.config()` (bare, override-default) from
  `apps/api/src/app.ts`: it loaded repo-root `.env` over the
  vault-resolved environment and wiped the vault secrets. Other services
  keep scoped `dotenv.config({ path: "../../.env", override: false })`
  for local dev only — never overrides real env.
- Kept Bun 1.4 image builds on GH Actions (no server builds), Prisma
  migrate in CI (`ERYX_DATABASE_URL_EXTERNAL`), SHA-tag redeploy +
  `/health` version gate per fleet pattern.

## Gaps
- `candles` / `marketdata` health endpoints exist in code but have no
  public domain — internal-only by design (no owner-facing UI reads
  them directly). If the uniform-probe rule ever requires public URLs
  for workers, attach `candles.project-eryx` / `marketdata.project-eryx`
  domains like `ws` got.
- Paper-trading only until real brokerage keys are added (no code
  change needed — env refs already flow through the pipeline).

## Shared auth (auth.shrijit.tech)
- `apps/api` has no local auth: `authenticateToken` replays the browser's
  `.shrijit.tech` session cookie to `GET auth.shrijit.tech/api/auth/get-session`
  and keys every request off the `auth_id` on the local user.
- First authenticated request provisions the user + a funded paper account
  (same DEPOSIT ledger row the old `/api/auth/register` wrote), so nobody can
  trade without a balance. `users.password_hash` is now nullable; the
  `20261012000000_shared_auth` migration adds `auth_id`.
- `/api/auth/login|register` and the JWT are gone. Agent endpoints keep their
  own `X-API-Key` (machine clients, not people).
