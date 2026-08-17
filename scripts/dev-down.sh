#!/bin/sh
set -eu
docker compose down
pnpm exec supabase stop
