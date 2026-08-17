import { createHash, randomUUID } from "node:crypto";
import type { ContentStore } from "@/lib/content-store/content-store";
import { ContentConflictError } from "@/lib/content-store/content-store";
import { publicContentHash } from "@/lib/content-store/markdown";
import type { ParsedPost, VaultDocument } from "@/features/posts/types";

export type ManagerPost = {
  id: string;
  source_path: string;
  source_locator: string;
  source_hash: string;
  title: string;
  content: string;
  platform: "linkedin" | "other";
  status: "draft" | "needs_changes" | "ready_for_review" | "approved" | "posted";
  post_type: string;
  source_url: string | null;
  target_date: string | null;
  recommended_time: string | null;
  metadata: Record<string, string>;
  live_url: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approved_content_hash: string | null;
  published_at: string | null;
  post_media: { relative_path: string; sort_order?: number }[];
  [key: string]: unknown;
};

export type ListPostFilters = { q?: string; status?: string; limit?: number };
export type ProjectionState = {
  documents: { relative_path: string; source_hash: string; deleted_at: string | null }[];
  posts: { id: string; source_hash: string; approved_content_hash: string | null }[];
  wrappers?: { media_hash: string; source_hash: string; deleted_at: string | null }[];
};

export interface ManagerRepository {
  getProfile(userId: string): Promise<{ id: string; can_approve: boolean } | null>;
  listPosts(filters: ListPostFilters): Promise<unknown[]>;
  getPost(id: string): Promise<ManagerPost | null>;
  getProjectionState(): Promise<ProjectionState>;
  addComment(postId: string, userId: string, body: string): Promise<unknown>;
  listComments(postId: string, limit: number): Promise<unknown[]>;
  listActivity(postId: string | undefined, limit: number): Promise<unknown[]>;
  listPublications(postId: string | undefined, limit: number): Promise<unknown[]>;
  addActivity(postId: string | null, userId: string, eventType: string, changes: Record<string, unknown>, sourceRevision?: string): Promise<void>;
}

export type DraftInput = {
  title: string;
  content: string;
  platform: "linkedin" | "other";
  postType: string;
  sourceUrl?: string;
  targetDate?: string;
  recommendedTime?: string;
  metadata?: Record<string, string>;
  mediaPaths?: string[];
  idempotencyKey?: string;
};

export type UpdateDraftInput = Partial<Omit<DraftInput, "idempotencyKey">> & { id: string; expectedSourceHash: string };

export type SyncPlan = {
  planToken: string;
  expectedSourceHashes: Record<string, string>;
  summary: {
    documents: number;
    posts: number;
    wrappers: number;
    missingIds: number;
    approvalInvalidations: number;
    projectionAdds: number;
    projectionUpdates: number;
    projectionRemovals: number;
  };
  proposedChanges: {
    assignIdsIn: string[];
    invalidateApprovalFor: string[];
    addDocuments: string[];
    updateDocuments: string[];
    removeDocuments: string[];
    addPosts: string[];
    updatePosts: string[];
    stalePostIds: string[];
    addWrappers: string[];
    updateWrappers: string[];
    removeWrappers: string[];
  };
};

export class ManagerOperationError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400, public readonly details?: unknown) {
    super(message);
    this.name = "ManagerOperationError";
  }
}

function deterministicUuid(key: string): string {
  const value = createHash("sha256").update(`social-media-manager:create-draft:${key}`).digest("hex").slice(0, 32).split("");
  value[12] = "4";
  value[16] = ((Number.parseInt(value[16]!, 16) & 0x3) | 0x8).toString(16);
  const hex = value.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function canonicalPost(document: VaultDocument, post: ParsedPost, projection: ManagerPost | null): ManagerPost {
  if (!post.id) throw new ManagerOperationError("POST_ID_MISSING", "Canonical post has no stable ID", 409);
  return {
    ...(projection ?? {}),
    id: post.id,
    source_path: post.sourcePath,
    source_locator: post.locator,
    source_hash: document.hash,
    title: post.title,
    content: post.content,
    platform: post.platform,
    status: post.status,
    post_type: post.postType,
    source_url: post.sourceUrl ?? null,
    target_date: post.targetDate ?? null,
    recommended_time: post.recommendedTime ?? null,
    metadata: post.metadata,
    live_url: post.liveUrl ?? null,
    approved_by: post.approvedBy ?? null,
    approved_at: post.approvedAt ?? null,
    approved_content_hash: post.approvedContentHash ?? null,
    published_at: post.publishedAt ?? null,
    post_media: post.mediaPaths.map((relative_path, sort_order) => ({ relative_path, sort_order })),
  };
}

function draftMatches(post: ManagerPost, input: DraftInput): boolean {
  return post.title === input.title && post.content === input.content.trim() && post.platform === input.platform
    && post.post_type === input.postType && (post.source_url ?? "") === (input.sourceUrl ?? "")
    && (post.target_date ?? "") === (input.targetDate ?? "")
    && (post.recommended_time ?? "") === (input.recommendedTime ?? "")
    && JSON.stringify(post.metadata) === JSON.stringify(input.metadata ?? {})
    && JSON.stringify(post.post_media.map((item) => item.relative_path)) === JSON.stringify(input.mediaPaths ?? []);
}

export function createManagerService(dependencies: {
  repository: ManagerRepository;
  store: ContentStore;
  reconcileProjection: () => Promise<unknown>;
  commitSync: (expectedSourceHashes: Record<string, string>) => Promise<unknown>;
}) {
  const { repository, store, reconcileProjection, commitSync } = dependencies;

  const getCanonicalPost = async (id: string): Promise<ManagerPost | null> => {
    const documents = await store.scan({ assignMissingIds: false });
    for (const document of documents) {
      const post = document.posts.find((item) => item.id === id);
      if (post) return canonicalPost(document, post, await repository.getPost(id));
    }
    return null;
  };

  const requireEditablePost = async (id: string) => {
    const post = await getCanonicalPost(id);
    if (!post) throw new ManagerOperationError("POST_NOT_FOUND", "Post not found", 404);
    if (post.status === "posted") throw new ManagerOperationError("POST_NOT_EDITABLE", "Posted posts cannot be changed", 409);
    return post;
  };

  const writePost = async (post: ManagerPost, userId: string, input: UpdateDraftInput, status: ManagerPost["status"], eventType: string) => {
    const title = input.title ?? post.title;
    const content = input.content ?? post.content;
    const platform = input.platform ?? post.platform;
    const postType = input.postType ?? post.post_type;
    const sourceUrl = input.sourceUrl === undefined ? post.source_url ?? undefined : input.sourceUrl || undefined;
    const targetDate = input.targetDate === undefined ? post.target_date ?? undefined : input.targetDate || undefined;
    const recommendedTime = input.recommendedTime === undefined ? post.recommended_time ?? undefined : input.recommendedTime || undefined;
    const metadata = input.metadata ?? post.metadata;
    const mediaPaths = input.mediaPaths ?? post.post_media.map((item) => item.relative_path);
    const nextHash = publicContentHash({ content, platform, postType, sourceUrl, mediaPaths });
    const approvalInvalidated = Boolean(post.approved_content_hash && post.approved_content_hash !== nextHash);
    const nextStatus = approvalInvalidated ? "needs_changes" : status;
    if (input.expectedSourceHash !== post.source_hash) {
      throw new ManagerOperationError("SOURCE_CONFLICT", "The canonical Markdown changed; fetch the post and review the newer version", 409, { currentSourceHash: post.source_hash });
    }
    const unchanged = title === post.title && content === post.content && platform === post.platform
      && postType === post.post_type && (sourceUrl ?? "") === (post.source_url ?? "")
      && (targetDate ?? "") === (post.target_date ?? "") && (recommendedTime ?? "") === (post.recommended_time ?? "")
      && JSON.stringify(metadata) === JSON.stringify(post.metadata)
      && JSON.stringify(mediaPaths) === JSON.stringify(post.post_media.map((item) => item.relative_path))
      && nextStatus === post.status;
    if (unchanged) return { ...post, approval_invalidated: false, no_change: true };
    try {
      const document = await store.patchPost({
        id: post.id, sourcePath: post.source_path, locator: post.source_locator,
        expectedSourceHash: input.expectedSourceHash, title, content, platform, status: nextStatus,
        postType, sourceUrl, targetDate, recommendedTime, metadata, liveUrl: post.live_url ?? undefined,
        mediaPaths, approvedBy: approvalInvalidated ? undefined : post.approved_by ?? undefined,
        approvedAt: approvalInvalidated ? undefined : post.approved_at ?? undefined,
        approvedContentHash: approvalInvalidated ? undefined : post.approved_content_hash ?? undefined,
        publishedAt: post.published_at ?? undefined,
      });
      await reconcileProjection();
      await repository.addActivity(post.id, userId, eventType, {
        from_status: post.status, to_status: nextStatus, approval_invalidated: approvalInvalidated,
      }, document.hash);
    } catch (error) {
      if (error instanceof ContentConflictError) {
        const current = await getCanonicalPost(post.id);
        throw new ManagerOperationError("SOURCE_CONFLICT", error.message, 409, { currentSourceHash: current?.source_hash });
      }
      throw error;
    }
    const updated = await getCanonicalPost(post.id);
    if (!updated) throw new ManagerOperationError("POST_NOT_FOUND", "Post disappeared after the canonical update", 409);
    return { ...updated, approval_invalidated: approvalInvalidated };
  };

  return {
    listPosts: (filters: ListPostFilters) => repository.listPosts(filters),
    getPost: async (id: string) => {
      const post = await getCanonicalPost(id);
      if (!post) throw new ManagerOperationError("POST_NOT_FOUND", "Post not found", 404);
      return { ...post, publications: await repository.listPublications(id, 100) };
    },
    createDraft: async (userId: string, input: DraftInput) => {
      const id = input.idempotencyKey ? deterministicUuid(input.idempotencyKey) : randomUUID();
      const existing = await getCanonicalPost(id);
      if (existing) {
        if (!draftMatches(existing, input)) throw new ManagerOperationError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used with different draft content", 409);
        return { ...existing, idempotent_replay: true };
      }
      const draft = {
        title: input.title, content: input.content, platform: input.platform, postType: input.postType,
        sourceUrl: input.sourceUrl, targetDate: input.targetDate, recommendedTime: input.recommendedTime,
        metadata: input.metadata, mediaPaths: input.mediaPaths,
      };
      const document = await store.createPost({ id, ...draft, status: "draft" });
      await reconcileProjection();
      await repository.addActivity(id, userId, "post_created", { title: input.title }, document.hash);
      const created = await getCanonicalPost(id);
      if (!created) throw new ManagerOperationError("POST_NOT_FOUND", "Draft was created but could not be read back", 409);
      return created;
    },
    updateDraft: async (userId: string, input: UpdateDraftInput) => {
      const post = await requireEditablePost(input.id);
      return writePost(post, userId, input, post.status, "post_edited");
    },
    submitForReview: async (userId: string, input: { id: string; expectedSourceHash: string }) => {
      const post = await requireEditablePost(input.id);
      if (post.status === "approved") throw new ManagerOperationError("FORBIDDEN_STATUS", "Approved posts cannot be resubmitted by the manager", 409);
      return writePost(post, userId, input, "ready_for_review", "status_changed");
    },
    addComment: async (userId: string, postId: string, body: string) => {
      if (!await getCanonicalPost(postId)) throw new ManagerOperationError("POST_NOT_FOUND", "Post not found", 404);
      return repository.addComment(postId, userId, body);
    },
    listComments: (postId: string, limit: number) => repository.listComments(postId, limit),
    listActivity: async (postId: string | undefined, limit: number) => ({
      activity: await repository.listActivity(postId, limit),
      publications: await repository.listPublications(postId, limit),
    }),
    syncDryRun: () => createSyncPlan(store, repository),
    syncCommit: async (userId: string, token: string, confirmation: string) => {
      if (confirmation !== "CONFIRM_SYNC") throw new ManagerOperationError("SYNC_CONFIRMATION_REQUIRED", "confirmation must be CONFIRM_SYNC", 400);
      const current = await createSyncPlan(store, repository);
      if (token !== current.planToken) throw new ManagerOperationError("SYNC_PLAN_CHANGED", "Vault or projection changed after the dry run; review a new plan", 409, current);
      let result;
      try {
        result = await commitSync(current.expectedSourceHashes);
      } catch (error) {
        if (error instanceof ContentConflictError) throw new ManagerOperationError("SYNC_PLAN_CHANGED", "Vault changed during sync commit; no further files were written", 409);
        throw error;
      }
      await repository.addActivity(null, userId, "vault_sync_committed", { summary: current.summary, proposed_changes: current.proposedChanges });
      return { plan: current, result };
    },
  };
}

export async function createSyncPlan(store: ContentStore, repository?: ManagerRepository): Promise<SyncPlan> {
  const documents = await store.scan({ assignMissingIds: false });
  const projection = repository ? await repository.getProjectionState() : { documents: [], posts: [], wrappers: [] };
  const canonicalDocuments = new Map(documents.map((document) => [document.relativePath, document]));
  const projectedDocuments = new Map(projection.documents.filter((item) => !item.deleted_at).map((item) => [item.relative_path, item]));
  const canonicalPosts = documents.flatMap((document) => document.posts.filter((post): post is ParsedPost & { id: string } => Boolean(post.id)).map((post) => ({ post, document })));
  const projectedPosts = new Map(projection.posts.map((post) => [post.id, post]));
  const assignIdsIn = documents.filter((document) => document.posts.some((post) => !post.id)).map((document) => document.relativePath);
  const invalidateApprovalFor = canonicalPosts.filter(({ post }) => Boolean(post.approvedContentHash && post.approvedContentHash !== publicContentHash(post))).map(({ post }) => post.id);
  const addDocuments = [...canonicalDocuments.keys()].filter((path) => !projectedDocuments.has(path));
  const updateDocuments = [...canonicalDocuments].filter(([path, document]) => projectedDocuments.has(path) && projectedDocuments.get(path)!.source_hash !== document.hash).map(([path]) => path);
  const removeDocuments = [...projectedDocuments.keys()].filter((path) => !canonicalDocuments.has(path));
  const addPosts = canonicalPosts.filter(({ post }) => !projectedPosts.has(post.id)).map(({ post }) => post.id);
  const updatePosts = canonicalPosts.filter(({ post, document }) => projectedPosts.has(post.id) && projectedPosts.get(post.id)!.source_hash !== document.hash).map(({ post }) => post.id);
  const canonicalIds = new Set(canonicalPosts.map(({ post }) => post.id));
  const stalePostIds = [...projectedPosts.keys()].filter((id) => !canonicalIds.has(id));
  const canonicalWrappers = documents.filter((document) => document.wrapper).map((document) => ({ wrapper: document.wrapper!, document }));
  const projectedWrappers = new Map((projection.wrappers ?? []).filter((wrapper) => !wrapper.deleted_at).map((wrapper) => [wrapper.media_hash, wrapper]));
  const addWrappers = canonicalWrappers.filter(({ wrapper }) => !projectedWrappers.has(wrapper.mediaHash)).map(({ wrapper }) => wrapper.mediaHash);
  const updateWrappers = canonicalWrappers.filter(({ wrapper, document }) => projectedWrappers.has(wrapper.mediaHash) && projectedWrappers.get(wrapper.mediaHash)!.source_hash !== document.hash).map(({ wrapper }) => wrapper.mediaHash);
  const canonicalWrapperHashes = new Set(canonicalWrappers.map(({ wrapper }) => wrapper.mediaHash));
  const removeWrappers = [...projectedWrappers.keys()].filter((hash) => !canonicalWrapperHashes.has(hash));
  const proposedChanges = { assignIdsIn, invalidateApprovalFor, addDocuments, updateDocuments, removeDocuments, addPosts, updatePosts, stalePostIds, addWrappers, updateWrappers, removeWrappers };
  const summary = {
    documents: documents.length,
    posts: documents.reduce((sum, document) => sum + document.posts.length, 0),
    wrappers: canonicalWrappers.length,
    missingIds: documents.flatMap((document) => document.posts).filter((post) => !post.id).length,
    approvalInvalidations: invalidateApprovalFor.length,
    projectionAdds: addDocuments.length + addPosts.length + addWrappers.length,
    projectionUpdates: updateDocuments.length + updatePosts.length + updateWrappers.length,
    projectionRemovals: removeDocuments.length + stalePostIds.length + removeWrappers.length,
  };
  const vaultFingerprint = documents.map((document) => [document.relativePath, document.hash]).sort(([left], [right]) => left.localeCompare(right));
  const projectionFingerprint = {
    documents: [...projection.documents].sort((left, right) => left.relative_path.localeCompare(right.relative_path)),
    posts: [...projection.posts].sort((left, right) => left.id.localeCompare(right.id)),
    wrappers: [...(projection.wrappers ?? [])].sort((left, right) => left.media_hash.localeCompare(right.media_hash)),
  };
  const expectedSourceHashes = Object.fromEntries(documents.map((document) => [document.relativePath, document.hash]));
  const planToken = createHash("sha256").update(JSON.stringify({ summary, proposedChanges, vaultFingerprint, projectionFingerprint })).digest("hex");
  return { planToken, expectedSourceHashes, summary, proposedChanges };
}
