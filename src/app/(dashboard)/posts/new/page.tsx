import { PostEditor } from "@/components/posts/post-editor";
import { createPostAction } from "@/features/posts/actions";

export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="narrow"><header className="page-head"><div><h1>New post</h1><p className="muted">Creates a canonical Markdown file in <code>drafts/active</code>.</p></div></header>{error && <p className="notice error">{error}</p>}<PostEditor post={{}} action={createPostAction} isNew /></main>;
}
