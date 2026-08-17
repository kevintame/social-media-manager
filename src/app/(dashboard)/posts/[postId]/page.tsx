import { notFound } from "next/navigation";
import { addCommentAction, removeMediaAction, updatePostAction, uploadMediaAction } from "@/features/posts/actions";
import { getPost } from "@/features/posts/queries";
import { PostEditor } from "@/components/posts/post-editor";
import { StatusBadge } from "@/components/posts/status-badge";
import type { PostStatus } from "@/features/posts/types";

type Comment = { id: string; body: string; created_at: string; profiles: { display_name: string } | null };
type Activity = { id: number; event_type: string; changes: Record<string, unknown>; created_at: string; profiles: { display_name: string } | null };
type Media = { id: string; file_name: string; mime_type: string; size_bytes: number };

export default async function PostPage({ params, searchParams }: { params: Promise<{ postId: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { postId } = await params;
  const query = await searchParams;
  const post = await getPost(postId);
  if (!post) notFound();
  const comments = [...(post.post_comments as Comment[] ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const activity = [...(post.post_activity as Activity[] ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const media = [...(post.post_media as Media[] ?? [])];
  return <main className="container">
    <header className="page-head"><div><StatusBadge status={post.status as PostStatus} /><h1>{post.title}</h1><p className="muted"><code>{post.source_path}</code> · {post.source_locator}</p></div></header>
    {query.error && <p className="notice error" role="alert">{query.error}</p>}{query.saved && <p className="notice">Changes saved to the vault.</p>}
    <div className="split"><PostEditor post={post} action={updatePostAction} /><aside className="stack">
      <section className="panel"><h2>Media</h2>{media.length ? <ul>{media.map((item) => <li key={item.id}><a className="title-link" href={`/api/media/${item.id}`} target="_blank">{item.file_name}</a> <span className="muted">({Math.ceil(item.size_bytes / 1024)} KB)</span><form action={removeMediaAction} style={{ display: "inline", marginLeft: ".5rem" }}><input type="hidden" name="postId" value={post.id} /><input type="hidden" name="mediaId" value={item.id} /><button type="submit" className="secondary">Remove</button></form></li>)}</ul> : <p className="muted">No media attached.</p>}
        <form action={uploadMediaAction}><input type="hidden" name="postId" value={post.id} /><label>Add image or video<input name="file" type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4" required /></label><div className="actions"><button type="submit" className="secondary">Upload</button></div></form>
      </section>
      <section className="panel"><h2>Internal feedback</h2>{comments.length ? comments.map((comment) => <article key={comment.id}><strong>{comment.profiles?.display_name ?? "Workspace member"}</strong><p>{comment.body}</p><p className="muted"><small>{new Date(comment.created_at).toLocaleString()}</small></p></article>) : <p className="muted">No feedback yet.</p>}
        <form action={addCommentAction}><input type="hidden" name="postId" value={post.id} /><label>Add feedback<textarea name="body" style={{ minHeight: "7rem" }} required /></label><div className="actions"><button type="submit" className="secondary">Add comment</button></div></form>
      </section>
      <section className="panel"><h2>Activity</h2>{activity.length ? <ol className="timeline">{activity.map((event) => <li key={event.id}><strong>{event.event_type.replaceAll("_", " ")}</strong><br /><span>{event.profiles?.display_name ?? "System"} · {new Date(event.created_at).toLocaleString()}</span>{Object.keys(event.changes ?? {}).length > 0 && <details><summary>Details</summary><pre>{JSON.stringify(event.changes, null, 2)}</pre></details>}</li>)}</ol> : <p className="muted">No activity recorded.</p>}</section>
    </aside></div>
  </main>;
}
