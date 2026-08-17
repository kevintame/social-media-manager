---
name: social-media-manager-mcp
description: Use when managing Kevin's drafts via the local safe MCP.
version: 1.1.0
metadata:
  hermes:
    tags: [social-media, drafts, mcp]
---

# Social Media Manager MCP

Use these tools for Kevin's local Social Media Manager. The Markdown vault is canonical. Supabase is only its searchable projection plus collaboration and publication history.

## Safety boundary

Allowed tools:

- `list_posts`, `get_post`
- `create_draft`, `update_draft`, `submit_for_review`
- `add_comment`, `list_comments`, `list_activity`
- `sync_dry_run`, `sync_commit`

Forbidden actions:

- Never approve or publish a post.
- Never delete posts, media, vault files, comments, or database records.
- Never run SQL, reset the database, or access arbitrary filesystem paths.
- Never work around `POST_NOT_EDITABLE`, `MANAGER_IDENTITY_INVALID`, or authentication errors.
- Never expose or repeat the manager token, Supabase keys, passwords, or other credentials.
- Never point tests at Kevin's canonical vault.

Posted posts are immutable through this integration. Only Kevin's profile may approve or publish.

## Tool rules

### Reading and searching

Use `list_posts` for status-filtered or text-filtered discovery. Use `get_post` before every edit. `get_post` reads canonical Markdown and returns `source_hash`, current status, metadata, media references, and publication history.

### Creating

`create_draft` requires `title` and exact public `content`. `platform` defaults to `linkedin`; `postType` defaults to `original`. Reuse a stable `idempotencyKey` when retrying the same creation request. If `IDEMPOTENCY_CONFLICT` occurs, stop and inspect the existing draft.

### Updating

`update_draft` requires `id` and the latest `expectedSourceHash`. Send only fields that should change. Editable fields are title, exact copy, platform, post type/action, source URL, target date, recommended time, string metadata, and safe vault-relative media references.

Changes to exact copy, source URL, platform, post type/action, or media references invalidate prior approval. The response reports `approval_invalidated: true`, clears approval, and changes status to `needs_changes`. Title, scheduling, and manager metadata alone do not invalidate approval.

On `SOURCE_CONFLICT`, never retry with a guessed hash. Call `get_post`, compare the canonical version, present the conflict to Kevin, and use the new hash only after resolving the edit.

### Review

`submit_for_review` requires `id` and the latest `expectedSourceHash`. It can only move an editable post to `ready_for_review`. It cannot approve or publish.

### Comments and history

Use `add_comment` for internal feedback. Use `list_comments` for the comment thread. `list_activity` returns both audit activity and publication history; it never creates a publication.

### Sync

1. Call `sync_dry_run`.
2. Present its `summary` and `proposedChanges`, including affected paths and IDs.
3. Ask Kevin explicitly whether to commit that exact plan.
4. Only after an affirmative reply, call `sync_commit` with the returned `planToken` and literal `confirmation: "CONFIRM_SYNC"`.
5. If `SYNC_PLAN_CHANGED` occurs, present the new dry run and ask again. Prior confirmation no longer applies.

A dry run does not modify the vault or Supabase. A commit can assign stable IDs, invalidate stale approvals, and reconcile the projection, so confirmation is mandatory.

## Examples

### 1. Create a draft

```json
{"title":"Trust is the AI feature","content":"Exact public copy here.","platform":"linkedin","postType":"original","idempotencyKey":"kevin-trust-feature-2026-08-17"}
```

Call `create_draft` with that object.

### 2. Update exact copy

First call `get_post`, then:

```json
{"id":"POST_UUID","expectedSourceHash":"CURRENT_64_CHAR_HASH","content":"Revised exact public copy."}
```

Call `update_draft`. If the post was approved, report that approval was invalidated.

### 3. Add a source URL

```json
{"id":"POST_UUID","expectedSourceHash":"CURRENT_64_CHAR_HASH","sourceUrl":"https://example.com/source"}
```

Call `update_draft`. A source change invalidates prior approval.

### 4. Submit for review

```json
{"id":"POST_UUID","expectedSourceHash":"CURRENT_64_CHAR_HASH"}
```

Call `submit_for_review`, then report the resulting status. Do not describe this as approval.

### 5. Add a comment

```json
{"postId":"POST_UUID","body":"The opening claim needs a concrete example before review."}
```

Call `add_comment`.

### 6. Run and present a sync dry run

Call `sync_dry_run` with `{}`. Present, at minimum:

- missing IDs and affected paths
- approval invalidations and post IDs
- projection additions, updates, and removals
- the fact that no changes have been made

Do not call `sync_commit` in the same turn unless Kevin has already explicitly approved that exact returned plan.

### 7. Ask before committing

Use wording such as:

> Dry run complete. It proposes 2 ID assignments, 1 approval invalidation, and 4 projection updates. No changes have been made. Do you want me to commit this exact sync plan?

After Kevin says yes, call:

```json
{"planToken":"TOKEN_FROM_THE_PRESENTED_DRY_RUN","confirmation":"CONFIRM_SYNC"}
```

## Registration

The app and adapter use the same manager token. Store it only in ignored local environment/configuration. The app needs `HERMES_MANAGER_TOKEN` and the non-approver `HERMES_MANAGER_USER_ID`. The Hermes MCP subprocess needs only `HERMES_MANAGER_TOKEN`, never the Supabase service-role key.

Example profile-local MCP configuration:

```yaml
mcp_servers:
  social_media_manager:
    command: "pnpm"
    args: ["--dir", "/Users/kevintame/Code/social-media-manager", "manager:mcp"]
    env:
      HERMES_MANAGER_TOKEN: "replace-locally; never commit"
```

Restart Hermes or use `/reload-mcp`, then verify discovery with `hermes mcp test social_media_manager`. Do not register or store a real token without Kevin's explicit approval.
