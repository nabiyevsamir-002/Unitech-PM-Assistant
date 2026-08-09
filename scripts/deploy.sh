#!/usr/bin/env bash
# Deploy the local working tree to the production droplet:
#   1) rsync the code up (data dirs + secrets are excluded/preserved),
#   2) rebuild + restart the Docker stack (Prisma migrations auto-apply via the
#      `migrate` service, which `app` depends on),
#   3) wait for the public /api/health probe to pass.
#
# Uses an SSH *alias* so no host/IP/key lives in this file (safe to commit).
#
# ── One-time setup ───────────────────────────────────────────────────────────
#   1. Add an SSH alias to ~/.ssh/config (Termius can import this file too):
#
#        Host unitech-pm
#            HostName unitech-pm-assistant.duckdns.org   # or the droplet IP
#            User samir                                  # your server user
#            IdentityFile ~/.ssh/id_ed25519              # your key
#
#      Test it:  ssh unitech-pm 'echo ok'
#   2. chmod +x scripts/deploy.sh
#
# ── Usage ────────────────────────────────────────────────────────────────────
#   ./scripts/deploy.sh
#   # or without an alias:
#   DEPLOY_SSH_HOST=samir@1.2.3.4 ./scripts/deploy.sh
set -euo pipefail

# ── Config (override via env vars) ───────────────────────────────────────────
SSH_HOST="${DEPLOY_SSH_HOST:-unitech-pm}"        # ~/.ssh/config alias, or user@host
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-unitech-pm}"    # project dir on the server (under $HOME)
PUBLIC_URL="${DEPLOY_PUBLIC_URL:-https://unitech-pm-assistant.duckdns.org}"
# ─────────────────────────────────────────────────────────────────────────────

LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$LOCAL_DIR"

echo "▶ 1/3  Syncing code → ${SSH_HOST}:~/${REMOTE_DIR}"
# --delete keeps the server in sync (files removed locally are removed there too).
# Excluded paths are NEVER deleted, so server data + secrets are safe.
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'uploads' \
  --exclude 'backups' \
  --exclude 'sample-data/backups' \
  --exclude '.env' \
  --exclude '.env.docker' \
  --exclude '.DS_Store' \
  --exclude 'tsconfig.tsbuildinfo' \
  --exclude '.idea' \
  -e ssh "${LOCAL_DIR}/" "${SSH_HOST}:${REMOTE_DIR}/"

echo "▶ 2/3  Rebuilding + restarting stack (migrations auto-apply)…"
ssh "$SSH_HOST" "cd ${REMOTE_DIR} && docker compose --env-file .env.docker -f compose.yaml -f compose.prod.yaml up -d --build"

echo "▶ 3/3  Waiting for ${PUBLIC_URL}/api/health …"
for _ in $(seq 1 24); do
  if body="$(curl -fsS "${PUBLIC_URL}/api/health" 2>/dev/null)"; then
    echo "✓ Deploy complete — ${body}"
    exit 0
  fi
  sleep 5
done

echo "⚠ Health check did not pass in ~2 min. Inspect logs:"
echo "   ssh ${SSH_HOST} 'cd ${REMOTE_DIR} && docker compose --env-file .env.docker logs --tail=80 app migrate'"
exit 1
