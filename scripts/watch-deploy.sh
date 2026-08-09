#!/usr/bin/env bash
# Auto-deploy on change: watch the source tree and run deploy.sh whenever files
# change, debounced so a burst of saves triggers ONE deploy (not one per save).
#
# Requires fswatch:   brew install fswatch
# Usage:              ./scripts/watch-deploy.sh          (Ctrl-C to stop)
#                     WATCH_DEBOUNCE=10 ./scripts/watch-deploy.sh
#
# ⚠ This deploys whatever is on disk right now — including half-finished edits.
#   Each deploy rebuilds the Docker image on the server (~1–3 min). For most
#   workflows, running ./scripts/deploy.sh by hand when you're ready is better;
#   use this only when you really want hands-off auto-deploy on a staging box.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEBOUNCE="${WATCH_DEBOUNCE:-6}"   # seconds of quiet before a deploy fires

command -v fswatch >/dev/null 2>&1 || {
  echo "fswatch not found. Install it:  brew install fswatch"
  exit 1
}

echo "👀 Watching src/ prisma/ public/ package.json — deploy after ${DEBOUNCE}s of quiet."
echo "   (Ctrl-C to stop)"

# -o = one event per batch; -l = latency/debounce window.
fswatch -o -l "$DEBOUNCE" \
  --exclude '\.next' --exclude 'node_modules' --exclude '\.git' \
  "$DIR/src" "$DIR/prisma" "$DIR/public" "$DIR/package.json" "$DIR/next.config.ts" \
| while read -r _; do
    echo "— $(date +%H:%M:%S) change detected → deploying"
    if "$DIR/scripts/deploy.sh"; then
      echo "— $(date +%H:%M:%S) ✓ deployed; watching again"
    else
      echo "— $(date +%H:%M:%S) ✗ deploy failed; will retry on next change"
    fi
  done
