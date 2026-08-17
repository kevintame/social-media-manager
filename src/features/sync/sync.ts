import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContentStore } from "@/lib/content-store/filesystem";
import type { VaultDocument } from "@/features/posts/types";

const REMOVED_POSTS_DOCUMENT = "_system/removed-posts";

export type SyncSummary = { documents: number; posts: number; missingIds: number; paths: string[] };

function summarize(documents: VaultDocument[]): SyncSummary {
  return {
    documents: documents.length,
    posts: documents.reduce((sum, document) => sum + document.posts.length, 0),
    missingIds: documents.flatMap((document) => document.posts).filter((post) => !post.id).length,
    paths: documents.filter((document) => document.posts.some((post) => !post.id)).map((document) => document.relativePath),
  };
}

async function projectDocuments(documents: VaultDocument[], summary: SyncSummary): Promise<SyncSummary> {
  const supabase = createAdminClient();
  const store = getContentStore();
  await supabase.from("sync_state").update({ status: "scanning", last_started_at: new Date().toISOString(), last_error: null }).eq("id", true);
  try {
    const seenPaths: string[] = [];
    const seenPostIds = new Set<string>();
    for (const document of documents) {
      seenPaths.push(document.relativePath);
      const { data: row, error } = await supabase.from("documents").upsert({
        relative_path: document.relativePath, kind: document.kind, title: document.title,
        excerpt: document.excerpt, content_text: document.content, source_hash: document.hash,
        size_bytes: document.sizeBytes, modified_at: document.modifiedAt, indexed_at: new Date().toISOString(), deleted_at: null,
      }, { onConflict: "relative_path" }).select("id").single();
      if (error) throw error;
      for (const post of document.posts) {
        if (!post.id) continue;
        seenPostIds.add(post.id);
        const { error: postError } = await supabase.from("posts").upsert({
          id: post.id, document_id: row.id, source_path: post.sourcePath, source_locator: post.locator,
          source_hash: document.hash, title: post.title, platform: post.platform, status: post.status,
          content: post.content, post_type: post.postType, source_url: post.sourceUrl ?? null,
          target_date: post.targetDate || null, recommended_time: post.recommendedTime ?? null,
          approved_by: post.approvedBy ?? null, approved_at: post.approvedAt ?? null,
          approved_content_hash: post.approvedContentHash ?? null, published_at: post.publishedAt ?? null,
          live_url: post.liveUrl ?? null,
        }, { onConflict: "id" });
        if (postError) throw postError;
        const mediaPaths = post.mediaPaths;
        for (const [sortOrder, relativePath] of mediaPaths.entries()) {
          const media = await store.inspectMedia(relativePath);
          const { error: mediaError } = await supabase.from("post_media").upsert({
            post_id: post.id, relative_path: media.relativePath, file_name: media.fileName,
            mime_type: media.mimeType, size_bytes: media.sizeBytes, content_hash: media.contentHash, sort_order: sortOrder,
          }, { onConflict: "relative_path" });
          if (mediaError) throw mediaError;
        }
        let staleMedia = supabase.from("post_media").delete().eq("post_id", post.id);
        if (mediaPaths.length) staleMedia = staleMedia.not("relative_path", "in", `(${mediaPaths.map((item) => `\"${item.replaceAll('"', '\\"')}\"`).join(",")})`);
        const { error: staleMediaError } = await staleMedia;
        if (staleMediaError) throw staleMediaError;
      }
    }
    const deletedAt = new Date().toISOString();
    let deletedDocuments = supabase.from("documents").update({ deleted_at: deletedAt }).neq("relative_path", REMOVED_POSTS_DOCUMENT);
    if (seenPaths.length) deletedDocuments = deletedDocuments.not("relative_path", "in", `(${seenPaths.map((item) => `\"${item.replaceAll('"', '\\"')}\"`).join(",")})`);
    const { error: deletionError } = await deletedDocuments;
    if (deletionError) throw deletionError;

    const { data: projectedPosts, error: projectedPostError } = await supabase.from("posts").select("id,documents!inner(deleted_at)").is("documents.deleted_at", null);
    if (projectedPostError) throw projectedPostError;
    const stalePostIds = (projectedPosts ?? []).map((post) => post.id).filter((id) => !seenPostIds.has(id));
    if (stalePostIds.length) {
      const { data: tombstone, error: tombstoneError } = await supabase.from("documents").upsert({
        relative_path: REMOVED_POSTS_DOCUMENT, kind: "other", title: "Removed canonical posts",
        excerpt: "Projection tombstone for posts removed from canonical Markdown.", content_text: "",
        source_hash: "removed", size_bytes: 0, modified_at: deletedAt, indexed_at: deletedAt, deleted_at: deletedAt,
      }, { onConflict: "relative_path" }).select("id").single();
      if (tombstoneError) throw tombstoneError;
      const { error: stalePostError } = await supabase.from("posts").update({ document_id: tombstone.id }).in("id", stalePostIds);
      if (stalePostError) throw stalePostError;
    }
    await supabase.from("sync_state").update({ status: "idle", last_completed_at: new Date().toISOString(), summary }).eq("id", true);
    return summary;
  } catch (error) {
    await supabase.from("sync_state").update({ status: "error", last_error: error instanceof Error ? error.message : String(error) }).eq("id", true);
    throw error;
  }
}

/** Read-only vault scan. This never changes Markdown or the projection. */
export async function scanVault(assignMissingIds = false): Promise<SyncSummary> {
  if (assignMissingIds) throw new Error("Bulk sync requires a reviewed plan and expected source hashes");
  return summarize(await getContentStore().scan({ assignMissingIds: false }));
}

/** Refresh Supabase from canonical Markdown without changing any vault file. */
export async function reconcileVaultProjection(): Promise<SyncSummary> {
  const documents = await getContentStore().scan({ assignMissingIds: false });
  return projectDocuments(documents, summarize(documents));
}

/** Explicit bulk commit: may assign IDs and invalidate stale approvals. */
export async function commitVaultSync(expectedSourceHashes: Record<string, string>): Promise<SyncSummary> {
  const documents = await getContentStore().scan({
    assignMissingIds: true,
    expectedSourceHashes,
    requireExactPaths: true,
  });
  const summary = { ...summarize(documents), missingIds: 0 };
  return projectDocuments(documents, summary);
}
