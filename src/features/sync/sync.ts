import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContentStore } from "@/lib/content-store/filesystem";

export type SyncSummary = { documents: number; posts: number; missingIds: number; paths: string[] };

export async function scanVault(assignMissingIds = false): Promise<SyncSummary> {
  const store = getContentStore();
  const documents = await store.scan({ assignMissingIds });
  const summary: SyncSummary = {
    documents: documents.length,
    posts: documents.reduce((sum, document) => sum + document.posts.length, 0),
    missingIds: documents.flatMap((document) => document.posts).filter((post) => !post.id).length,
    paths: documents.filter((document) => document.posts.some((post) => !post.id)).map((document) => document.relativePath),
  };
  if (!assignMissingIds) return summary;

  const supabase = createAdminClient();
  await supabase.from("sync_state").update({ status: "scanning", last_started_at: new Date().toISOString(), last_error: null }).eq("id", true);
  try {
    const seenPaths: string[] = [];
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
      }
    }
    if (seenPaths.length) await supabase.from("documents").update({ deleted_at: new Date().toISOString() }).not("relative_path", "in", `(${seenPaths.map((p) => `\"${p.replaceAll('"', '\\"')}\"`).join(",")})`);
    await supabase.from("sync_state").update({ status: "idle", last_completed_at: new Date().toISOString(), summary }).eq("id", true);
    return { ...summary, missingIds: 0 };
  } catch (error) {
    await supabase.from("sync_state").update({ status: "error", last_error: error instanceof Error ? error.message : String(error) }).eq("id", true);
    throw error;
  }
}
