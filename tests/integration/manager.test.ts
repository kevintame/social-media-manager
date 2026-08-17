import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ManagerPost, ManagerRepository, ProjectionState } from "@/features/manager/core";
import { createManagerService, createSyncPlan } from "@/features/manager/core";
import { publicContentHash } from "@/lib/content-store/markdown";

vi.mock("server-only", () => ({}));
import { FilesystemContentStore } from "@/lib/content-store/filesystem";

const USER_ID = "22222222-2222-4222-8222-222222222222";

describe("manager service with a temporary vault", () => {
  let root: string;
  let store: FilesystemContentStore;
  let posts: Map<string, ManagerPost>;
  let projection: ProjectionState;
  let activities: { postId: string | null; eventType: string }[];
  let repository: ManagerRepository;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "social-manager-"));
    await mkdir(path.join(root, "drafts", "active"), { recursive: true });
    posts = new Map();
    projection = { documents: [], posts: [] };
    activities = [];
    store = new FilesystemContentStore(root);
    repository = {
      async getProfile() { return { id: USER_ID, can_approve: false }; },
      async listPosts() { return [...posts.values()]; },
      async getPost(id) { return posts.get(id) ?? null; },
      async getProjectionState() { return projection; },
      async addComment(postId, userId, body) { return { post_id: postId, author_id: userId, body }; },
      async listComments() { return []; },
      async listActivity() { return activities; },
      async listPublications() { return []; },
      async addActivity(postId, _userId, eventType) { activities.push({ postId, eventType }); },
    };
  });

  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  async function project(assignMissingIds: boolean, expectedSourceHashes?: Record<string, string>) {
    const documents = await store.scan({ assignMissingIds, expectedSourceHashes, requireExactPaths: Boolean(expectedSourceHashes) });
    projection = {
      documents: documents.map((document) => ({ relative_path: document.relativePath, source_hash: document.hash, deleted_at: null })),
      posts: documents.flatMap((document) => document.posts.filter((post) => post.id).map((post) => ({ id: post.id!, source_hash: document.hash, approved_content_hash: post.approvedContentHash ?? null }))),
    };
    for (const document of documents) {
      for (const post of document.posts) {
        if (!post.id) continue;
        const current = posts.get(post.id);
        posts.set(post.id, {
          ...current,
          id: post.id, source_path: post.sourcePath, source_locator: post.locator, source_hash: document.hash,
          title: post.title, content: post.content, platform: post.platform, status: post.status,
          post_type: post.postType, source_url: post.sourceUrl ?? null, target_date: post.targetDate ?? null,
          recommended_time: post.recommendedTime ?? null, metadata: post.metadata, live_url: post.liveUrl ?? null,
          approved_by: post.approvedBy ?? null, approved_at: post.approvedAt ?? null,
          approved_content_hash: post.approvedContentHash ?? null, published_at: post.publishedAt ?? null,
          post_media: post.mediaPaths.map((relative_path, sort_order) => ({ relative_path, sort_order })),
        });
      }
    }
    return { documents: documents.length, posts: posts.size };
  }

  function service() {
    return createManagerService({
      repository,
      store,
      reconcileProjection: () => project(false),
      commitSync: (expectedSourceHashes) => project(true, expectedSourceHashes),
    });
  }

  it("dry-runs without mutation, rejects stale plans, and commits only a confirmed current plan", async () => {
    const file = path.join(root, "drafts", "active", "legacy.md");
    await writeFile(file, "---\nstatus: draft\n---\n# Legacy\n\n## Exact post text or reshare note\n\nCopy\n");
    const before = await readFile(file, "utf8");
    const firstPlan = await createSyncPlan(store, repository);
    expect(firstPlan.summary.missingIds).toBe(1);
    expect(await readFile(file, "utf8")).toBe(before);

    await writeFile(file, `${before}\nExternal edit.\n`);
    await expect(service().syncCommit(USER_ID, firstPlan.planToken, "CONFIRM_SYNC")).rejects.toMatchObject({ code: "SYNC_PLAN_CHANGED" });
    expect(await readFile(file, "utf8")).not.toContain("post_id:");

    const currentPlan = await service().syncDryRun();
    await service().syncCommit(USER_ID, currentPlan.planToken, "CONFIRM_SYNC");
    expect(await readFile(file, "utf8")).toContain("post_id:");
    expect(activities).toContainEqual({ postId: null, eventType: "vault_sync_committed" });
  });

  it("validates every planned file before the first bulk write", async () => {
    const first = path.join(root, "drafts", "active", "first.md");
    const second = path.join(root, "drafts", "active", "second.md");
    const legacy = (title: string) => `---\nstatus: draft\n---\n# ${title}\n\n## Exact post text or reshare note\n\nCopy\n`;
    await writeFile(first, legacy("First"));
    await writeFile(second, legacy("Second"));
    const plan = await createSyncPlan(store, repository);
    const racingService = createManagerService({
      repository,
      store,
      reconcileProjection: () => project(false),
      commitSync: async (expectedSourceHashes) => {
        await writeFile(second, `${legacy("Second")}\nLate external edit.\n`);
        return project(true, expectedSourceHashes);
      },
    });
    await expect(racingService.syncCommit(USER_ID, plan.planToken, "CONFIRM_SYNC")).rejects.toMatchObject({ code: "SYNC_PLAN_CHANGED" });
    expect(await readFile(first, "utf8")).not.toContain("post_id:");
  });

  it("creates idempotently and updates owned fields while preserving unowned Markdown", async () => {
    const manager = service();
    const input = {
      title: "Temp draft", content: "First copy", platform: "linkedin" as const, postType: "original",
      sourceUrl: "https://example.com/source", targetDate: "2026-08-20", recommendedTime: "9:15 AM",
      metadata: { campaign: "trust" }, mediaPaths: ["assets/example.png"], idempotencyKey: "stable-request-123",
    };
    const created = await manager.createDraft(USER_ID, input) as ManagerPost;
    const replay = await manager.createDraft(USER_ID, input) as ManagerPost & { idempotent_replay: boolean };
    expect(replay.id).toBe(created.id);
    expect(replay.idempotent_replay).toBe(true);

    const file = path.join(root, created.source_path);
    await writeFile(file, `${await readFile(file, "utf8")}\n## Private notes\n\nKeep this text.\n`);
    await project(false);
    const current = await manager.getPost(created.id) as ManagerPost;
    const updated = await manager.updateDraft(USER_ID, {
      id: created.id, expectedSourceHash: current.source_hash, content: "Changed copy",
      sourceUrl: "https://example.com/new", recommendedTime: "10:00 AM", metadata: { campaign: "ai-trust" },
      mediaPaths: ["assets/new.png"],
    }) as ManagerPost;
    expect(updated.content).toBe("Changed copy");
    expect(updated.recommended_time).toBe("10:00 AM");
    expect(updated.metadata).toEqual({ campaign: "ai-trust" });
    expect(updated.post_media[0]?.relative_path).toBe("assets/new.png");
    expect(await readFile(file, "utf8")).toContain("Keep this text.");
  });

  it("invalidates approval, returns source conflicts, and protects posted posts", async () => {
    const manager = service();
    const created = await manager.createDraft(USER_ID, { title: "Approval", content: "Approved copy", platform: "linkedin", postType: "original" }) as ManagerPost;
    const approvedHash = publicContentHash({ content: created.content, platform: created.platform, postType: created.post_type, sourceUrl: undefined, mediaPaths: [] });
    await store.patchPost({
      id: created.id, sourcePath: created.source_path, locator: created.source_locator, expectedSourceHash: created.source_hash,
      title: created.title, content: created.content, platform: created.platform, status: "approved", postType: created.post_type,
      approvedBy: "11111111-1111-4111-8111-111111111111", approvedAt: "2026-08-16T12:00:00.000Z", approvedContentHash: approvedHash,
    });
    await project(false);
    const approved = await manager.getPost(created.id) as ManagerPost;
    const updated = await manager.updateDraft(USER_ID, { id: approved.id, expectedSourceHash: approved.source_hash, content: "Changed copy" }) as ManagerPost;
    expect(updated.status).toBe("needs_changes");
    expect(updated.approved_content_hash).toBeNull();

    const file = path.join(root, updated.source_path);
    await writeFile(file, `${await readFile(file, "utf8")}\nExternal change.\n`);
    await expect(manager.updateDraft(USER_ID, { id: updated.id, expectedSourceHash: updated.source_hash, title: "Conflict" }))
      .rejects.toMatchObject({ code: "SOURCE_CONFLICT" });

    await project(false);
    const current = await manager.getPost(updated.id) as ManagerPost;
    await store.patchPost({
      id: current.id, sourcePath: current.source_path, locator: current.source_locator, expectedSourceHash: current.source_hash,
      title: current.title, content: current.content, platform: current.platform, status: "posted", postType: current.post_type,
      publishedAt: "2026-08-16T13:00:00.000Z",
    });
    await project(false);
    await expect(manager.updateDraft(USER_ID, { id: current.id, expectedSourceHash: current.source_hash, title: "No" }))
      .rejects.toMatchObject({ code: "POST_NOT_EDITABLE" });
  });
});
