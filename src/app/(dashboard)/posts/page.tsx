import Link from "next/link";
import { listPosts } from "@/features/posts/queries";
import { StatusBadge } from "@/components/posts/status-badge";
import type { PostStatus } from "@/features/posts/types";

export default async function PostsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; location?: string; error?: string }> }) {
  const filters = await searchParams;
  const posts = await listPosts(filters);
  return <main className="container">
    <header className="page-head"><div><h1>Posts</h1><p className="muted">Plan, review, approve, and track exact social copy.</p></div><Link href="/posts/new" className="button">New post</Link></header>
    {filters.error && <p className="notice error">{filters.error}</p>}
    <form className="filters">
      <input name="q" aria-label="Search posts" placeholder="Search title or exact copy" defaultValue={filters.q} />
      <select name="status" aria-label="Filter by status" defaultValue={filters.status}><option value="">All statuses</option><option value="draft">Draft</option><option value="needs_changes">Needs changes</option><option value="ready_for_review">Ready for review</option><option value="approved">Approved</option><option value="posted">Posted</option></select>
      <select name="location" aria-label="Filter by location" defaultValue={filters.location}><option value="">All locations</option><option value="drafts/active">Active drafts</option><option value="drafts/daily">Daily bundles</option><option value="published">Published</option></select>
      <button type="submit" className="secondary">Filter</button>
    </form>
    {!posts.length ? <section className="panel"><h2>No posts found</h2><p className="muted">Run a vault sync to index existing drafts, or create a new post.</p><div className="actions"><Link className="button" href="/import">Sync vault</Link></div></section> : <>
      <div className="table-wrap panel"><table><thead><tr><th>Post</th><th>Status</th><th>Platform</th><th>Target</th><th>Source</th></tr></thead><tbody>{posts.map((post) => <tr key={post.id}><td><Link className="title-link" href={`/posts/${post.id}`}>{post.title}</Link><div className="preview">{post.content}</div></td><td><StatusBadge status={post.status as PostStatus} /></td><td>{post.platform}</td><td>{post.target_date ?? "—"}</td><td><code>{post.source_path}</code></td></tr>)}</tbody></table></div>
      <div className="cards">{posts.map((post) => <article className="panel" key={post.id}><StatusBadge status={post.status as PostStatus} /><h2><Link href={`/posts/${post.id}`}>{post.title}</Link></h2><p className="muted">{post.content.slice(0, 180)}</p><code>{post.source_path}</code></article>)}</div>
    </>}
  </main>;
}
