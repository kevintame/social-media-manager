import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function listPosts(filters: { q?: string; status?: string; location?: string } = {}) {
  const supabase = await createClient();
  let query = supabase.from("posts").select("*, profiles:updated_by(display_name), documents!inner(deleted_at)").is("documents.deleted_at", null).order("updated_at", { ascending: false }).limit(250);
  if (filters.q) query = query.or(`title.ilike.%${filters.q}%,content.ilike.%${filters.q}%`);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.location) query = query.ilike("source_path", `${filters.location}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getPost(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("posts").select("*, profiles:updated_by(display_name), post_media(*), post_comments(*, profiles:author_id(display_name)), post_activity(*, profiles:actor_id(display_name)), documents!inner(deleted_at)").eq("id", id).is("documents.deleted_at", null).single();
  if (error) return null;
  return data;
}

export async function listDocuments(q?: string) {
  const supabase = await createClient();
  let query = supabase.from("documents").select("id,relative_path,kind,title,excerpt,modified_at").is("deleted_at", null).order("modified_at", { ascending: false }).limit(250);
  if (q) query = query.textSearch("search_vector", q, { type: "websearch" });
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
