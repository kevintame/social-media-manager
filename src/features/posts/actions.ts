"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContentStore } from "@/lib/content-store/filesystem";
import { ContentConflictError } from "@/lib/content-store/content-store";
import { commentSchema, createPostSchema, postInputSchema } from "./schema";
import { publicContentHash } from "@/lib/content-store/markdown";
import { scanVault } from "@/features/sync/sync";

function value(form: FormData, key: string) { return String(form.get(key) ?? ""); }

export async function loginAction(form: FormData) {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: value(form, "email"), password: value(form, "password") });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/posts");
}

export async function signOutAction() {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function syncAction(form: FormData) {
  await requireUser();
  const commit = value(form, "commit") === "true";
  let summary;
  try {
    summary = await scanVault(commit);
  } catch (error) {
    redirect(`/import?error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
  }
  redirect(`/import?result=${encodeURIComponent(JSON.stringify(summary))}&mode=${commit ? "commit" : "dry"}`);
}

export async function createPostAction(form: FormData) {
  const user = await requireUser();
  const parsed = createPostSchema.safeParse({
    title: value(form, "title"), content: value(form, "content"), platform: value(form, "platform"),
    status: value(form, "status"), postType: value(form, "postType"), sourceUrl: value(form, "sourceUrl"),
    targetDate: value(form, "targetDate"), liveUrl: value(form, "liveUrl"),
  });
  if (!parsed.success) redirect(`/posts/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid post")}`);
  const id = randomUUID();
  const document = await getContentStore().createPost({ id, ...parsed.data });
  await scanVault(true);
  const admin = createAdminClient();
  await admin.from("posts").update({ created_by: user.id, updated_by: user.id }).eq("id", id);
  await admin.from("post_activity").insert({ post_id: id, actor_id: user.id, event_type: "post_created", changes: { title: parsed.data.title }, source_revision: document.hash });
  redirect(`/posts/${id}`);
}

export async function updatePostAction(form: FormData) {
  const user = await requireUser();
  const parsed = postInputSchema.safeParse({
    id: value(form, "id"), expectedSourceHash: value(form, "expectedSourceHash"), title: value(form, "title"),
    content: value(form, "content"), platform: value(form, "platform"), status: value(form, "status"),
    postType: value(form, "postType"), sourceUrl: value(form, "sourceUrl"), targetDate: value(form, "targetDate"), liveUrl: value(form, "liveUrl"),
  });
  const fallbackId = value(form, "id");
  if (!parsed.success) redirect(`/posts/${fallbackId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid post")}`);

  const admin = createAdminClient();
  const { data: current, error } = await admin.from("posts").select("*, post_media(relative_path)").eq("id", parsed.data.id).single();
  if (error || !current) redirect("/posts?error=Post%20not%20found");
  const { data: profile } = await admin.from("profiles").select("can_approve").eq("id", user.id).single();
  const requestedStatus = parsed.data.status;
  const nextHash = publicContentHash({
    content: parsed.data.content, platform: parsed.data.platform, postType: parsed.data.postType,
    sourceUrl: parsed.data.sourceUrl || undefined, mediaPaths: (current.post_media ?? []).map((item: { relative_path: string }) => item.relative_path),
  });
  const publicChanged = nextHash !== current.approved_content_hash && Boolean(current.approved_content_hash);
  let status = requestedStatus;
  let approvedBy = current.approved_by ?? undefined;
  let approvedAt = current.approved_at ?? undefined;
  let approvedHash = current.approved_content_hash ?? undefined;

  if (requestedStatus === "approved") {
    if (!profile?.can_approve) redirect(`/posts/${parsed.data.id}?error=Only%20Kevin%20can%20approve%20a%20post`);
    approvedBy = user.id;
    approvedAt = new Date().toISOString();
    approvedHash = nextHash;
  } else if (publicChanged || !["approved", "posted"].includes(requestedStatus)) {
    approvedBy = undefined; approvedAt = undefined; approvedHash = undefined;
    if (publicChanged && requestedStatus === "posted") status = "needs_changes";
  }
  if (requestedStatus === "posted" && (!approvedHash || approvedHash !== nextHash)) {
    redirect(`/posts/${parsed.data.id}?error=The%20exact%20content%20must%20be%20approved%20before%20posting`);
  }
  const publishedAt = status === "posted" ? (current.published_at ?? new Date().toISOString()) : undefined;

  try {
    const document = await getContentStore().patchPost({
      ...parsed.data, status, sourcePath: current.source_path, locator: current.source_locator,
      approvedBy, approvedAt, approvedContentHash: approvedHash, publishedAt,
    });
    await scanVault(true);
    await admin.from("posts").update({ updated_by: user.id }).eq("id", parsed.data.id);
    await admin.from("post_activity").insert({
      post_id: parsed.data.id, actor_id: user.id, event_type: status !== current.status ? "status_changed" : "post_edited",
      changes: { from_status: current.status, to_status: status, approval_invalidated: publicChanged }, source_revision: document.hash,
    });
    if (status === "posted" && approvedHash && publishedAt) {
      const ledgerPath = await getContentStore().recordPublication({ id: parsed.data.id, title: parsed.data.title, platform: parsed.data.platform, contentHash: approvedHash, publishedAt, liveUrl: parsed.data.liveUrl || undefined });
      await admin.from("publications").insert({ post_id: parsed.data.id, content_hash: approvedHash, platform: parsed.data.platform, published_at: publishedAt, live_url: parsed.data.liveUrl || null, ledger_path: ledgerPath, created_by: user.id });
    }
  } catch (writeError) {
    const message = writeError instanceof ContentConflictError ? writeError.message : writeError instanceof Error ? writeError.message : String(writeError);
    redirect(`/posts/${parsed.data.id}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/posts/${parsed.data.id}`);
  redirect(`/posts/${parsed.data.id}?saved=true`);
}

export async function addCommentAction(form: FormData) {
  const user = await requireUser();
  const parsed = commentSchema.safeParse({ postId: value(form, "postId"), body: value(form, "body") });
  if (!parsed.success) redirect(`/posts/${value(form, "postId")}?error=Comment%20cannot%20be%20empty`);
  const admin = createAdminClient();
  await admin.from("post_comments").insert({ post_id: parsed.data.postId, body: parsed.data.body, author_id: user.id });
  await admin.from("post_activity").insert({ post_id: parsed.data.postId, actor_id: user.id, event_type: "comment_added", changes: {} });
  revalidatePath(`/posts/${parsed.data.postId}`);
  redirect(`/posts/${parsed.data.postId}`);
}

export async function uploadMediaAction(form: FormData) {
  const user = await requireUser();
  const postId = value(form, "postId");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) redirect(`/posts/${postId}?error=Choose%20a%20media%20file`);
  const admin = createAdminClient();
  const { data: current, error } = await admin.from("posts").select("*, post_media(relative_path)").eq("id", postId).single();
  if (error || !current) redirect("/posts?error=Post%20not%20found");
  const store = getContentStore();
  let media: Awaited<ReturnType<typeof store.writeMedia>>;
  try {
    media = await store.writeMedia(postId, file.name, Buffer.from(await file.arrayBuffer()));
    const mediaPaths = [...(current.post_media ?? []).map((item: { relative_path: string }) => item.relative_path), media.relativePath];
    await store.patchPost({
      id: postId, sourcePath: current.source_path, locator: current.source_locator, expectedSourceHash: current.source_hash,
      title: current.title, content: current.content, platform: current.platform, status: current.approved_at ? "needs_changes" : current.status,
      postType: current.post_type, sourceUrl: current.source_url ?? undefined, targetDate: current.target_date ?? undefined,
      liveUrl: current.live_url ?? undefined, mediaPaths,
    });
    await scanVault(true);
    await admin.from("post_media").insert({ post_id: postId, relative_path: media.relativePath, file_name: media.fileName, mime_type: media.mimeType, size_bytes: media.sizeBytes, content_hash: media.contentHash, sort_order: mediaPaths.length - 1 });
    await admin.from("posts").update({ updated_by: user.id }).eq("id", postId);
    await admin.from("post_activity").insert({ post_id: postId, actor_id: user.id, event_type: "media_added", changes: { file_name: media.fileName, approval_invalidated: Boolean(current.approved_at) } });
  } catch (mediaError) {
    redirect(`/posts/${postId}?error=${encodeURIComponent(mediaError instanceof Error ? mediaError.message : String(mediaError))}`);
  }
  revalidatePath(`/posts/${postId}`);
  redirect(`/posts/${postId}?saved=true`);
}

export async function removeMediaAction(form: FormData) {
  const user = await requireUser();
  const postId = value(form, "postId");
  const mediaId = value(form, "mediaId");
  const admin = createAdminClient();
  const { data: current } = await admin.from("posts").select("*, post_media(*)").eq("id", postId).single();
  const target = current?.post_media?.find((item: { id: string }) => item.id === mediaId);
  if (!current || !target) redirect(`/posts/${postId}?error=Media%20not%20found`);
  const mediaPaths = current.post_media.filter((item: { id: string }) => item.id !== mediaId).map((item: { relative_path: string }) => item.relative_path);
  try {
    await getContentStore().patchPost({
      id: postId, sourcePath: current.source_path, locator: current.source_locator, expectedSourceHash: current.source_hash,
      title: current.title, content: current.content, platform: current.platform, status: current.approved_at ? "needs_changes" : current.status,
      postType: current.post_type, sourceUrl: current.source_url ?? undefined, targetDate: current.target_date ?? undefined,
      liveUrl: current.live_url ?? undefined, mediaPaths,
    });
    await getContentStore().removeMedia(target.relative_path);
    await admin.from("post_media").delete().eq("id", mediaId);
    await scanVault(true);
    await admin.from("posts").update({ updated_by: user.id }).eq("id", postId);
    await admin.from("post_activity").insert({ post_id: postId, actor_id: user.id, event_type: "media_removed", changes: { file_name: target.file_name, approval_invalidated: Boolean(current.approved_at) } });
  } catch (mediaError) {
    redirect(`/posts/${postId}?error=${encodeURIComponent(mediaError instanceof Error ? mediaError.message : String(mediaError))}`);
  }
  revalidatePath(`/posts/${postId}`);
  redirect(`/posts/${postId}?saved=true`);
}
