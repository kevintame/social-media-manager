# Repository instructions

- The Markdown vault mounted at `SOCIAL_MEDIA_ROOT` is canonical. Never make bulk changes without an explicit dry-run and user confirmation.
- Tests must use fixture or temporary vaults, never `/Users/kevintame/Vaults/Second Brain/02 Areas/Social Media`.
- Only `src/lib/content-store/` may access filesystem paths from the vault.
- Preserve unowned Markdown content when patching posts.
- Exact public-copy, source, platform/action, or media edits invalidate approval.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before handoff.
- Local services use OrbStack via the Supabase CLI and Docker Compose. Do not add Docker-in-Docker or mount the Docker socket into the app.
