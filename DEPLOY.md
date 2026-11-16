# Deployment — project-eryx (production, Dokploy)

## The rule

Push to `main`. Nothing else deploys.

`git push origin main` → `validate` (typecheck, unit tests, web build, `docker compose config -q`) →
`build` (5 images, `linux/amd64,linux/arm64`, SHA tag) → `scan` (Trivy, HIGH+CRITICAL) →
`deploy-prod` (migrate, re-assert env, repoint, `application.redeploy`) → gate.

Three gates before production exists at all: the deploy job runs `if: github.ref == 'refs/heads/main'`,
builds happen only on GitHub runners, and the last step polls `/health` until `version` equals this run's SHA.

Manual prod builds from a dev machine are not available and there is no SSH deploy path:
`scripts/deploy-remote.sh` is a deliberate `exit 1` stub kept fail-closed. `docker-compose.yml` is
dev-only (postgres + redis, no passwords); its header says so and CI only runs `docker compose config -q`
against it.

`workflow_dispatch` exists, but note what it does **not** do: dispatching from any ref other than `main`
runs validate/build/scan and stops — the `if:` gate skips the deploy job. To redeploy the same commit,
dispatch on `main`.

## The deployed apps

One image per service, from one matrix in `.github/workflows/ci-cd.yml`. The matrix names are
shorter than the workspace directories — the suffix on the image is the matrix name, not the app name.

| App | Image | Public domain | Port | Notes |
|---|---|---|---|---|
| web | `ghcr.io/shrijit37/project-eryx-web:${{ github.sha }}` | `https://project-eryx.shrijit.tech` | `PORT=3008` | Next.js SPA; `api`/`ws`/`auth` URLs baked in at **build** time |
| api | `ghcr.io/shrijit37/project-eryx-api:${{ github.sha }}` | `https://api.project-eryx.shrijit.tech` | `PORT=8080` | Express 5 + Prisma. Only app with `AUTH_URL` + `FINNHUB_API` |
| ws | `ghcr.io/shrijit37/project-eryx-ws:${{ github.sha }}` | `https://ws.project-eryx.shrijit.tech` | `WS_PORT=4040` | Socket.IO relay; `apps/ws-gateway` |
| candles | `ghcr.io/shrijit37/project-eryx-candles:${{ github.sha }}` | none | `HEALTH_PORT=4100` | `apps/candle-worker`. No owner-facing UI reads it |
| marketdata | `ghcr.io/shrijit37/project-eryx-marketdata:${{ github.sha }}` | none | `HEALTH_PORT=4200` | `apps/market-data-worker`, Python/yfinance |

Dockerfiles: `api`/`ws`/`candles` share `apps/Dockerfile.bun` with `ARG SERVICE` + `ARG ENTRY`;
`marketdata` uses `apps/Dockerfile.py`; `web` uses `apps/Dockerfile.web`. The web image's
`NEXT_PUBLIC_*` values are build args — changing a domain is a rebuild, not an env push.

**Data services get no public domain.** `candles` and `marketdata` are internal-only by design:
nothing owner-facing probes them directly, so `STATE.md` records their health as "via code, not probed".
If the uniform-probe rule ever demands public URLs for workers, add
`candles.project-eryx` / `marketdata.project-eryx` the way `ws` got one.

Supporting services (Dokploy-managed, not built here): postgres `3C-uP8nyF1h5hUhTFELyL`
(`postgres:18-alpine`, external `:15437`), redis `sMPEAyMCZPEjnKF27kW9N` (`redis:8-alpine`).
Project `BBhocEXMJFpVIbjdYh8hM`, environment `vwuphOCLdCkF-KCCmeGqs`.

## Health

Uniform contract, no per-service variants, no `/api/health` alias:

```
GET /health -> { status, service, version, checks }
```

`status` is `ok`/`degraded`/`down`; `version` is `APP_VERSION`, which the pipeline sets to the full
commit SHA. 503 when a critical dependency is down, 200 otherwise.

| Service | Route file | `service` | Checks | Critical? |
|---|---|---|---|---|
| api | `apps/api/src/app.ts:77` | `eryx-api` | `prisma.$queryRaw SELECT 1`, `redis.ping()` | both — either down ⇒ 503 |
| ws | `apps/ws-gateway/src/index.ts:21` | `eryx-ws` | `sub.ping()` | yes ⇒ 503 |
| candles | `apps/candle-worker/src/index.ts:130` | `eryx-candles` | `SELECT 1`, `sub.ping()` | both ⇒ 503 |
| marketdata | `apps/market-data-worker/src/main.py:20` | `eryx-marketdata` | loop freshness, not a live probe | both ⇒ 503 |
| web | `apps/web/app/health/route.ts` | `eryx-web` | fetch `${NEXT_PUBLIC_API_URL}/health`, 5s timeout | reports `degraded`, **still 200** |

Two behaviours worth knowing:

- `marketdata` never probes anything. It timestamps the last successful DB and Redis use and reports
  `down` for anything not confirmed within `180.0`s (`_STALE_AFTER_S`). A wedged ingest loop fails
  truthfully instead of reporting stale-but-green.
- `web` always returns **200**, even with `api: "down"` (it emits `status: "degraded"`). The gate greps
  for `"status":"ok"`, so a degraded web fails the gate even though the HTTP code is green.

Gate: 30 attempts per URL, `sleep 6`, `curl --max-time 10`. Converged = body contains `"status":"ok"`
**and** `"version":"<this run's SHA>"`. Only two URLs are gated:

| Var | URL |
|---|---|
| `vars.API_URL` | `https://api.project-eryx.shrijit.tech` |
| `vars.WEB_URL` | `https://project-eryx.shrijit.tech` |

`ws` is deployed but not gated. `candles`/`marketdata` are not gated (no public URL).

## Secrets

App secrets come from **Doppler** (project `platform`, config `prd`, `ERYX_` prefix) and reach the
container as Dokploy vault refs — `application.saveEnvironment` is given the literal strings
`{{vault.doppler-prod.<KEY>}}`, never the values.

| Key | Powers | Reaching the app |
|---|---|---|
| `ERYX_DATABASE_URL` | Prisma, all three JS services | vault ref, re-asserted every deploy |
| `ERYX_REDIS_PASSWORD` | ioredis / redis-py auth | vault ref, re-asserted every deploy |
| `ERYX_FINNHUB_API_KEY` | live quotes + fundamentals on `api` | vault ref; without it workers fall back to yfinance-only |

`ERYX_DATABASE_URL_EXTERNAL` is a **fourth, separate key**: CI fetches it with the Doppler CLI
(`dopplerhq/cli-action@v4` + `doppler secrets get ERYX_DATABASE_URL_EXTERNAL --plain --silent`, against
`secrets.DOPPLER_TOKEN`) to run `prisma migrate deploy` from outside the Dokploy network. It is never
an app env var.

Plain (non-secret) values travel as `vars.REDIS_HOST` / `vars.REDIS_PORT` — the shared Redis endpoint is
an internal address, not a credential.

`AUTH_URL=https://auth.shrijit.tech` is hardcoded in the workflow, not a secret. There is no
`ERYX_JWT_SECRET`: identity moved to the shared auth service and the browser holds the `.shrijit.tech`
session cookie.

### Rotating a secret

The workflow re-asserts env *before* every redeploy, so a rotation is: change the value in Doppler,
push anything to `main`, read the log for `env re-asserted for <name>` on all five apps.

For `ERYX_REDIS_PASSWORD` that ordering is not enough on its own — the managed Redis must be
restarted before the apps are. Rotate in this order (`STATE.md`):

1. Update the secret in Doppler.
2. `redis.update` + `redis.deploy` on the managed Redis — wait for the container restart.
3. Re-assert app env (step above).
4. Redeploy the apps.

Skipping the order is what produced the earlier `NOAUTH` / `WRONGPASS` crash loop; the first rotation
never reached the running container before the apps re-asserted env against it.

## Repo configuration

Pipeline plumbing. These are **not** app secrets.

| Name | Kind | Scope | Purpose |
|---|---|---|---|
| `DOKPLOY_URL` | var | org | Dokploy base URL |
| `DOKPLOY_API_KEY` | secret | repo | `x-api-key` on all three Dokploy calls |
| `GHCR_PULL_TOKEN` | secret | repo | long-lived PAT, `read:packages` — **never** `GITHUB_TOKEN` |
| `DOPPLER_TOKEN` | secret | repo | read-only, config-scoped Doppler service token (project `platform`, config `prd`) for the migration step |
| `DOKPLOY_API_ID` | var | repo | `KptvzEDpXqBYPPWIt4b-0` |
| `DOKPLOY_WS_ID` | var | repo | `_IKOkFsYjCgsuP-oIBo5I` |
| `DOKPLOY_CANDLES_ID` | var | repo | `tUAKiA1sGXxbnDXt_gKGk` |
| `DOKPLOY_MARKETDATA_ID` | var | repo | `bwCM8Ghlviwm5Atl8Iino` |
| `DOKPLOY_WEB_ID` | var | repo | `WkI9-9uejJrva_R_duQyJ` |
| `REDIS_HOST` / `REDIS_PORT` | var | repo | shared Redis internal endpoint |
| `API_URL` | var | repo | `https://api.project-eryx.shrijit.tech` (gate) |
| `WEB_URL` | var | repo | `https://project-eryx.shrijit.tech` (gate) |

The five app IDs are consumed positionally: `APP_NAMES: api ws candles marketdata web` is zipped
against the space-joined `APP_IDS`. Reordering one list without the other silently reconfigures the
wrong app.

The deploy job also declares `environment: prod`, so GitHub environment protection rules (if any) gate
the deploy job — not the build.

### Registry binding

`application.saveDockerProvider` binds GHCR **credentials**, not just an image tag:

```
{"applicationId":"…","dockerImage":"…","username":"<github.actor>","password":"<GHCR_PULL_TOKEN>","registryUrl":"ghcr.io"}
```

The username is the pushing actor and the password is the long-lived `GHCR_PULL_TOKEN`. This is the
condition the workflow header calls out: *"long-lived read:packages — never GITHUB_TOKEN"*. The deploy
job's own `GITHUB_TOKEN` is short-lived (~1h) and expires at job end; bind it and every later Dokploy
pull fails with `401`/`unauthorized` even though the image is sitting in GHCR and the pipeline is green.
Note the deploy job requests `contents: read` only — the OIDC `id-token: write` went away with the
Doppler cutover — and no `packages` scope: the PAT is what crosses the boundary, not job permissions.

The images are private to the org; there is no anonymous-pull path.

## When the gate fails

| Symptom | Cause |
|---|---|
| `https://api…/health never converged` after 30 attempts | api is crash-looping, not slow. Check its Dokploy logs first — a 503 `{"status":"down","checks":{"database":"down"}}` means Postgres, `{"redis":"down"}` means Redis auth. A `200` with the wrong `version` means the redeploy never picked up the new image. |
| `https://project-eryx…/health never converged`, api is fine | web is `degraded` (its api fetch timed out at 5s) or the baked `NEXT_PUBLIC_API_URL` points somewhere stale. The gate greps `"status":"ok"`, and web returns 200 even when degraded — a green HTTP code here is not a pass. |
| Version stuck on the previous SHA | `application.redeploy` did not run, or ran against a different app ID than you expect (check the positional zip above). |
| `::warning::migrate failed on <sha> - deploying anyway` | `prisma migrate deploy` exited non-zero and the step deliberately continued. Deploying anyway is intentional: aborting would leave prod on old images against a new schema. The health gate is the real gate — but a schema mismatch here will show up as an api 503, so read the migration output before trusting the run. |
| `NOAUTH Authentication required` / `WRONGPASS` in logs | Redis password rotated without the 4-step order above. See **Rotating a secret**. |
| api exits immediately on `DATABASE_URL` missing | `saveEnvironment` REPLACES the whole env, so every key must be present in the re-assertion — including the static ports. Vault refs are blanked after a deploy consumes them; the workflow re-asserts them every run for this reason. |
| Dokploy cannot pull the image | `GHCR_PULL_TOKEN` expired, or was swapped for `GITHUB_TOKEN`. See **Registry binding**. |
| Trivy blocks on HIGH/CRITICAL | Expected — the scan job has no `continue-on-error`. Fix the CVE; there is no skip flag in this workflow. |

## What goes in git (and what never does)

In git: source, the three Dockerfiles, `ci-cd.yml`, migrations, `bun.lock`, `.env.production.example`
(all placeholders).

Never in git: any `ERYX_*` value, `DOKPLOY_API_KEY`, `GHCR_PULL_TOKEN`, `.env`, the resolved
`ERYX_DATABASE_URL_EXTERNAL` output of the Doppler fetch. `apps/api/src/app.ts` has **no**
`dotenv.config()` — a bare one once loaded repo-root `.env` over the vault-resolved environment and
wiped the prod secrets. The other services keep `dotenv.config({ path: "../../.env", override: false })`
for local dev; never let that flip to `override: true`.

`.next/`, `node_modules/` and `.turbo/` are ignored.