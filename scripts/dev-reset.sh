#!/bin/sh
set -eu
if [ "${CONFIRM_RESET:-}" != "destroy-local-collaboration-data" ]; then
  echo "Refusing to reset: this destroys local comments, activity, and indexed state."
  echo "Run: CONFIRM_RESET=destroy-local-collaboration-data pnpm dev:reset"
  exit 1
fi
pnpm exec supabase db reset
node --env-file=.env scripts/seed-users.mjs
