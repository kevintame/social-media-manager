#!/bin/sh
set -eu

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env. Set the Supabase keys after the first start if they differ from local defaults."
fi
pnpm exec supabase start
docker compose up --build -d app
pnpm run dev:status
