#!/usr/bin/env bash
# Remote deploy script for Project Eryx.
# Invoked over SSH by the GitHub Actions deploy job (see .github/workflows/ci-cd.yml).
# Assumes the repository is already cloned at ~/projects/eryx and a repo-root
# `.env` (with DATABASE_URL, JWT_SECRET, ...) exists on the server.
set -euo pipefail

APP_DIR="/home/ubuntu/projects/eryx"
export PATH="$HOME/.bun/bin:/usr/local/bin:/usr/bin:$PATH"

cd "$APP_DIR"

echo "==> [1/7] Syncing code from origin/main"
git fetch origin
git checkout -f main
git reset --hard origin/main

echo "==> [2/7] Installing dependencies"
bun install --frozen-lockfile 2>/dev/null || bun install

echo "==> [3/7] Loading server env (.env)"
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
else
  echo "!! .env missing on server - deploy will fail without DATABASE_URL"
fi

echo "==> [4/7] Generating Prisma client + applying migrations"
(cd packages/db && bunx prisma generate && bunx prisma migrate deploy)

echo "==> [5/7] Seeding symbols (idempotent, best-effort)"
(cd packages/db && bunx tsx prisma/seed.ts) || echo "!! seed did not fully complete - check logs"

echo "==> [6/7] Building web + API for production"
export NEXT_PUBLIC_API_URL="https://api.eryx.triptribe.info"
export NEXT_PUBLIC_WS_URL="https://api.eryx.triptribe.info"
bunx turbo run build --force

echo "==> [6b/7] Ensuring market-data worker dependencies"
python3 -m pip install --user --break-system-packages --quiet asyncpg redis schedule 2>/dev/null || echo "!! worker deps install failed"

echo "==> [7/7] Restarting services"
pm2 restart ecosystem.config.cjs --update-env 2>/dev/null || pm2 start ecosystem.config.cjs
pm2 save

echo "==> Reloading nginx"
sudo nginx -t && sudo systemctl reload nginx

echo "==> Deploy complete"
pm2 ls | grep -E "eryx" || true