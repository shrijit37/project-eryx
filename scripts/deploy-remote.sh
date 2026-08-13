#!/usr/bin/env bash
# Remote deploy script for Project Eryx.
# Invoked over SSH by the GitHub Actions deploy job (see .github/workflows/ci-cd.yml).
# Assumes the repository is already cloned at ~/projects/eryx and a repo-root
# `.env` (with DATABASE_URL, JWT_SECRET, ...) exists on the server.
set -euo pipefail

APP_DIR="/home/ubuntu/projects/eryx"
export PATH="$HOME/.bun/bin:/usr/local/bin:/usr/bin:$PATH"

cd "$APP_DIR"

echo "==> [1/6] Syncing code from origin/main"
git fetch origin
git checkout -f main
git reset --hard origin/main

echo "==> [2/6] Verifying server .env"
if [[ ! -f .env ]]; then
  echo "!! .env missing on server - deploy will fail without DATABASE_URL"
  exit 1
fi

echo "==> [3/6] Building + starting Docker stack"
docker compose up -d --build --remove-orphans

echo "==> [4/6] Applying Prisma migrations + seeding"
DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env)"
if [[ -z "$DATABASE_URL" ]]; then
  echo "!! DATABASE_URL empty in .env"
  exit 1
fi
docker run --rm --network host -v "$APP_DIR":/app -w /app/packages/db \
  -e DATABASE_URL="$DATABASE_URL" \
  oven/bun:1.4 sh -lc 'bunx prisma migrate deploy' \
  && echo "migrate OK"
docker run --rm --network host -v "$APP_DIR":/app -w /app/packages/db \
  -e DATABASE_URL="$DATABASE_URL" \
  oven/bun:1.4 sh -lc 'bunx tsx prisma/seed.ts' \
  || echo "!! seed did not fully complete - check logs"

echo "==> [5/6] Reloading nginx"
sudo nginx -t && sudo systemctl reload nginx

echo "==> [6/6] Health checks"
sleep 3
curl -s -o /dev/null -w "  api :8080 -> %{http_code}\n" http://127.0.0.1:8080/ || true
curl -s -o /dev/null -w "  web :3008 -> %{http_code}\n" http://127.0.0.1:3008/ || true

echo "==> Deploy complete"
docker ps --filter "name=eryx" --format "table {{.Names}}\t{{.Status}}"
