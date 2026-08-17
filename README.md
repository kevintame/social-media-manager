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

## Hermes manager API and MCP adapter

The authenticated `POST /api/manager` endpoint exposes only draft, review,
comment, activity, publication-history inspection, and guarded sync operations.
Configure `HERMES_MANAGER_TOKEN` and `HERMES_MANAGER_USER_ID` in the ignored
`.env`; the configured profile must exist and must have `can_approve=false`.
Generate the token locally with `openssl rand -hex 32`. Requests are accepted
only on a loopback hostname. The API has no approval, publishing, deletion, SQL,
media upload, database reset, or arbitrary filesystem operation. Posted posts
are immutable.

Run the dependency-free stdio adapter with `pnpm manager:mcp`. It calls
`http://127.0.0.1:3000/api/manager` by default. `HERMES_MANAGER_URL` may override
the URL but must remain loopback. The adapter needs only the manager token. Do
not pass `SUPABASE_SERVICE_ROLE_KEY`, manager passwords, or Kevin's credentials
to Hermes.

Register it in the active Hermes profile:

```yaml
mcp_servers:
  social_media_manager:
    command: "pnpm"
    args: ["--dir", "/Users/kevintame/Code/social-media-manager", "manager:mcp"]
    env:
      HERMES_MANAGER_TOKEN: "replace-locally; never commit"
```

Restart Hermes or use `/reload-mcp`, then run
`hermes mcp test social_media_manager`. Discovered tools are prefixed by Hermes
as `mcp_social_media_manager_*`. The reusable operating instructions are in
`.hermes/skills/social-media-manager-mcp/SKILL.md`.

Sync is two-step: call `sync_dry_run`, present its summary and proposed paths or
IDs, then ask for explicit confirmation. Only after confirmation, pass the
returned `planToken` to `sync_commit` with the literal `CONFIRM_SYNC`. Commit
recomputes the plan and rejects a stale token. Background `/api/sync` polling is
read-only. Normal draft creates and edits reconcile Supabase without making
vault-wide Markdown changes.

## Commands

- `pnpm dev:up` — start local Supabase and the application container
- `pnpm dev:down` — stop both stacks without deleting data
- `pnpm dev:status` — show Supabase and app container status
- `pnpm dev:logs` — follow application logs
- `CONFIRM_RESET=destroy-local-collaboration-data pnpm dev:reset` — destroy and recreate local database metadata
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — quality gates

## Data ownership and recovery

Post Markdown, approval metadata, media references, and publication ledgers live in the mounted vault. Supabase comments and activity are operational data and should be backed up before destructive resets. Normal `dev:down` and restarts preserve both Supabase volumes and vault files.
