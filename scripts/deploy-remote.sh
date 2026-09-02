#!/usr/bin/env bash
# Remote deploy script for Project Eryx — DEPRECATED.
#
# Project Eryx is now deployed by Dokploy (compose service "project-eryx/dc").
# GitHub Actions CI only validates; Dokploy handles building + deploying.
# This script is kept fail-closed so it can never accidentally deploy
# outside Dokploy (e.g. via a leftover SSH cron or manual invocation).
set -euo pipefail

echo "!! scripts/deploy-remote.sh is deprecated — Project Eryx is deployed via Dokploy."
echo "!! See https://docs.dokploy.com for the Compose service configuration."
exit 1