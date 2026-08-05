---
name: eryx-progress
description: >-
  Snapshot and maintain Project Eryx's progress file (`progress.md`). Use this
  skill whenever the user asks to update progress, take a snapshot of the
  project, record what's been built, check where the project stands, or capture
  the current directory structure / feature status. It regenerates an accurate
  picture of the monorepo (apps, packages, DB schema, API surface, phase
  checklist from AGENTS.md) and writes it to progress.md. Also use it to build a
  snapshot from scratch when progress.md is missing or stale, and to keep the
  phase checklists (Phase 0–7) in sync with what the code actually does.
---

# Project Eryx Progress Snapshot

Maintain `progress.md` as a living, accurate snapshot of **Project Eryx** — a mock stock
exchange / AI agent trading simulator (Turborepo + Bun monorepo). The snapshot covers
directory structure, feature progress by phase, DB schema, market-data pipeline, and the
API surface.

## When to use

- "Update progress", "take a snapshot of the project", "what's the status?", "what have we built so far?"
- Before starting a new phase, so the checklist reflects what already works.
- After finishing a chunk of work, so the checklist and structure stay truthful.

## Core rule

**Accuracy over speed.** Every claim in `progress.md` must be verifiable against the current
tree. If you are not sure whether something is wired up or just scaffolded, READ the file —
do not infer from names. A common failure is marking an endpoint "done" when it only
validates and echoes, or marking an engine "wired" when it exists only as a package.

## How to produce a snapshot

Work through these steps, updating `progress.md` (create it if missing).

### 1. Structure

Capture the source-tree, excluding noise (`node_modules`, `.venv`, `.next`, `dist`, `.turbo`,
`generated/prisma` internals, lockfiles are fine to mention but don't enumerate):

```bash
find . -type f \
  -not -path './.git/*' \
  -not -path '*/node_modules/*' \
  -not -path '*/.venv/*' \
  -not -path '*/.next/*' \
  -not -path '*/dist/*' \
  -not -path '*/.turbo/*' \
  -not -path '*/generated/prisma/*' | sort
```

Update the `## 2. Directory structure` tree in `progress.md` to match. Note new files
(e.g. a new `modules/*` folder in `apps/api/src/modules/`).

### 2. Git state

```bash
git branch --show-current
git log --oneline -10
git status --short
```

Record branch, HEAD, and uncommitted work in `## 8. Git state`.

### 3. Read the ground truth files

These are the files that determine what is actually done vs. scaffolded:

- `AGENTS.md` — the phase plan (0–7); the checklist must track it.
- `apps/api/src/app.ts` — which routers are mounted, and under what auth.
- `apps/api/src/modules/*/` — controllers/routes/validation. **Verify behavior**, don't assume:
  - does the controller persist? does it call the risk/execution engine? or just `safeParse` + echo?
  - look for commented-out branches, placeholder `return`, `console.log` scaffolding.
- `packages/execution-engine/src/*` — which engines exist as pure logic.
- `packages/db/prisma/schema.prisma` — models/enums actually present.
- `apps/web/app/page.tsx` + `apps/web/lib/useMarketData.ts` — what the frontend renders and how it gets data.
- `apps/ws-gateway/src/index.ts` and `apps/market-data-worker/src/main.py` — data pipeline wiring.

### 4. Classify each feature honestly

Use a strict 3-state vocabulary in the checklist:

| Marker | Meaning |
|---|---|
| ✅ | Fully working end-to-end (wired, exercised, does what the plan says) |
| 🟡 | Partial / scaffolded / logic exists but not wired into the running system |
| ❌ | Not started |

Do **not** mark a phase item ✅ just because a file with that name exists. Wired-ness is the test.
Call out known gaps explicitly (e.g. "controller queries `User` by an account id" or "engine
exists in the package but is never imported").

### 5. Update the snapshot

- Bump `> **Last updated:**` to today's date (the current date is provided in context).
- Update `## 3. Feature progress by phase` per the 3-state rule.
- Update `## 4. Database`, `## 5. Market data pipeline`, `## 6. API surface`, `## 7. Tech stack`
  only when they actually change; keep them concise and accurate.
- Refresh `## 9. Next steps` to match the current in-progress phase.

## Structure of progress.md

`progress.md` lives at the repo root and must keep this shape so it stays scannable:

```
# Project Eryx — Progress Snapshot          → header + last-updated date + branch/HEAD
## 1. What this project is                  → two modes + core principle
## 2. Directory structure                   → accurate tree of apps/, packages/, tests/
## 3. Feature progress by phase             → checklist per Phase 0–7, with ✅/🟡/❌
## 4. Database                              → enums, models, migrations, seed, client
## 5. Market data pipeline                  → seed → worker → redis → ws-gateway → web
## 6. API surface                           → route table (path, method, auth, notes)
## 7. Tech stack summary                    → per-layer stack + notable quirks
## 8. Git state & uncommitted work          → branch, commits, dirty files
## 9. Next steps                            → ordered, actionable, tied to current phase
```

Keep the 9-section shape stable; add new subsections under existing headings rather than
reorganizing. If a section drifts out of date, refresh it; if nothing changed, leave it.
