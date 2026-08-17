import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ListPostFilters, ManagerPost, ManagerRepository } from "./core";

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export function createSupabaseManagerRepository(): ManagerRepository {
  const admin = createAdminClient();
  return {
    async getProfile(userId) {
      const { data, error } = await admin.from("profiles").select("id,can_approve").eq("id", userId).maybeSingle();
      throwIfError(error);
      return data;
    },
    async listPosts(filters: ListPostFilters) {
      let query = admin.from("posts").select("*, post_media(relative_path,sort_order), documents!inner(deleted_at)").is("documents.deleted_at", null).order("updated_at", { ascending: false }).limit(filters.limit ?? 50);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.q) {
        const term = filters.q.replace(/[%,()_]/g, " ").trim();
        if (term) query = query.or(`title.ilike.%${term}%,content.ilike.%${term}%`);
      }
      const { data, error } = await query;
      throwIfError(error);
      return data ?? [];
    },
    async getPost(id) {
      const { data, error } = await admin.from("posts").select("*, post_media(relative_path,sort_order)").eq("id", id).maybeSingle();
      throwIfError(error);
      return data as ManagerPost | null;
    },
    async getProjectionState() {
      const [{ data: documents, error: documentError }, { data: posts, error: postError }, { data: wrappers, error: wrapperError }] = await Promise.all([
        admin.from("documents").select("relative_path,source_hash,deleted_at"),
        admin.from("posts").select("id,source_hash,approved_content_hash,documents!inner(deleted_at)").is("documents.deleted_at", null),
        admin.from("wrappers").select("media_hash,documents!inner(source_hash,deleted_at)"),
      ]);
      throwIfError(documentError);
      throwIfError(postError);
      throwIfError(wrapperError);
      return {
        documents: documents ?? [], posts: posts ?? [],
        wrappers: (wrappers ?? []).map((wrapper) => {
          const document = Array.isArray(wrapper.documents) ? wrapper.documents[0] : wrapper.documents;
          return { media_hash: wrapper.media_hash, source_hash: document?.source_hash ?? "", deleted_at: document?.deleted_at ?? null };
        }),
      };
    },
    async addComment(postId, userId, body) {
      const { data, error } = await admin.from("post_comments").insert({ post_id: postId, author_id: userId, body }).select("*, profiles:author_id(display_name)").single();
      throwIfError(error);
      const { error: activityError } = await admin.from("post_activity").insert({ post_id: postId, actor_id: userId, event_type: "comment_added", changes: {} });
      throwIfError(activityError);
      return data;
    },
    async listComments(postId, limit) {
      const { data, error } = await admin.from("post_comments").select("*, profiles:author_id(display_name)").eq("post_id", postId).order("created_at", { ascending: true }).limit(limit);
      throwIfError(error);
      return data ?? [];
    },
    async listActivity(postId, limit) {
      let query = admin.from("post_activity").select("*, profiles:actor_id(display_name)").order("created_at", { ascending: false }).limit(limit);
      if (postId) query = query.eq("post_id", postId);
      const { data, error } = await query;
      throwIfError(error);
      return data ?? [];
    },
    async listPublications(postId, limit) {
      let query = admin.from("publications").select("id,post_id,content_hash,platform,published_at,live_url,ledger_path,created_by,created_at").order("published_at", { ascending: false }).limit(limit);
      if (postId) query = query.eq("post_id", postId);
      const { data, error } = await query;
      throwIfError(error);
      return data ?? [];
    },
    async addActivity(postId, userId, eventType, changes, sourceRevision) {
      const { error } = await admin.from("post_activity").insert({
        post_id: postId, actor_id: userId, event_type: eventType, changes, source_revision: sourceRevision ?? null,
      });
      throwIfError(error);
    },
  };
}
