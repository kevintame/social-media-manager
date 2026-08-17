import type { PostStatus } from "@/features/posts/types";

type EditablePost = { id?: string; source_hash?: string; title?: string; content?: string; platform?: string; status?: PostStatus; post_type?: string; source_url?: string | null; target_date?: string | null; live_url?: string | null };

export function PostEditor({ post, action, isNew = false }: { post: EditablePost; action: (form: FormData) => void | Promise<void>; isNew?: boolean }) {
  return <form action={action} className="panel form-grid">
    {!isNew && <><input type="hidden" name="id" value={post.id} /><input type="hidden" name="expectedSourceHash" value={post.source_hash} /></>}
    <label className="full">Internal title<input name="title" required maxLength={200} defaultValue={post.title} /></label>
    <label>Platform<select name="platform" defaultValue={post.platform ?? "linkedin"}><option value="linkedin">LinkedIn</option><option value="other">Other</option></select></label>
    <label>Post type<input name="postType" defaultValue={post.post_type ?? "original"} required /></label>
    <label>Status<select name="status" defaultValue={post.status ?? "draft"}><option value="draft">Draft</option><option value="needs_changes">Needs changes</option><option value="ready_for_review">Ready for Kevin review</option><option value="approved">Approved (Kevin only)</option><option value="posted">Posted</option></select></label>
    <label>Target date<input name="targetDate" type="date" defaultValue={post.target_date ?? ""} /></label>
    <label className="full">Source URL<input name="sourceUrl" type="url" defaultValue={post.source_url ?? ""} /></label>
    <label className="full">Exact public copy<textarea name="content" defaultValue={post.content} maxLength={30000} /></label>
    <label className="full">Live post URL<input name="liveUrl" type="url" defaultValue={post.live_url ?? ""} /></label>
    <div className="actions full"><button type="submit">{isNew ? "Create draft" : "Save changes"}</button>{!isNew && <span className="muted">Saving checks the source file for outside changes.</span>}</div>
  </form>;
}
