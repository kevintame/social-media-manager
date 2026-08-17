# Social Content Manager

A private, local-first Next.js application for managing Kevin's social content. The Obsidian social-media folder remains canonical; local Supabase supplies authentication, search projections, comments, and activity history.

## Prerequisites

- OrbStack running with the `orbstack` Docker context
- Node.js 22+
- pnpm 11+

## First start

1. Copy `.env.example` to `.env` and verify `SOCIAL_MEDIA_HOST_PATH`.
2. Run `pnpm install`.
3. Run `pnpm exec supabase start` once and copy the reported anon and service-role keys into `.env`.
4. Run `CONFIRM_RESET=destroy-local-collaboration-data pnpm dev:reset` to apply migrations and seed the local users.
5. Run `pnpm dev:up` and open <http://127.0.0.1:3000>.

Local accounts seeded by `supabase/seed.sql`:

- `kevin@example.test` / `local-kevin-change-me`
- `manager@example.test` / `local-manager-change-me`

These credentials are local development defaults only. Change the ignored `.env` and seed configuration before sharing access.

## Safe initial import

Open **Sync** and run **Dry run** first. It reads the vault without changing it. Review the file list, then use **Commit sync** to add stable post IDs, build the Supabase index, and reconcile approval hashes.

The app is intentionally bound to localhost. No cloud deployment or remote synchronization is configured.

## Commands

- `pnpm dev:up` — start local Supabase and the application container
- `pnpm dev:down` — stop both stacks without deleting data
- `pnpm dev:status` — show Supabase and app container status
- `pnpm dev:logs` — follow application logs
- `CONFIRM_RESET=destroy-local-collaboration-data pnpm dev:reset` — destroy and recreate local database metadata
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — quality gates

## Data ownership and recovery

Post Markdown, approval metadata, media references, and publication ledgers live in the mounted vault. Supabase comments and activity are operational data and should be backed up before destructive resets. Normal `dev:down` and restarts preserve both Supabase volumes and vault files.
