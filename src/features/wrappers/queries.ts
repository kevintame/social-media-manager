import "server-only";
import { createClient } from "@/lib/supabase/server";

export type WrapperFilters = { q?: string; platform?: string; format?: string };

const wrapperSelect = "*, documents!inner(relative_path,deleted_at)";

export async function listWrappers(filters: WrapperFilters = {}) {
  const supabase = await createClient();
  let query = supabase.from("wrappers").select(wrapperSelect).is("documents.deleted_at", null)
    .order("created_on", { ascending: false, nullsFirst: false }).order("title", { ascending: true }).limit(250);
  if (filters.q?.trim()) query = query.textSearch("search_vector", filters.q.trim(), { type: "websearch" });
  if (filters.platform) query = query.eq("platform", filters.platform);
  if (filters.format) query = query.eq("format", filters.format);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listWrapperFacets() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("wrappers").select("platform,format,documents!inner(deleted_at)").is("documents.deleted_at", null);
  if (error) throw error;
  return {
    platforms: [...new Set((data ?? []).map((item) => item.platform))].sort(),
    formats: [...new Set((data ?? []).map((item) => item.format))].sort(),
  };
}

export async function getWrapper(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("wrappers").select(wrapperSelect).eq("slug", slug).is("documents.deleted_at", null).maybeSingle();
  if (error) throw error;
  return data;
}
