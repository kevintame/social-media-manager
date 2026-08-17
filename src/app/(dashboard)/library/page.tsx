import Link from "next/link";
import { listDocuments } from "@/features/posts/queries";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const documents = await listDocuments(q);
  return <main className="container"><header className="page-head"><div><h1>Vault library</h1><p className="muted">Authenticated, read-only access to strategy, ideas, templates, wrappers, sources, and post files.</p></div></header>
    <form className="filters" style={{ gridTemplateColumns: "1fr auto" }}><input name="q" defaultValue={q} placeholder="Search the vault" aria-label="Search the vault" /><button type="submit">Search</button></form>
    <section className="stack">{documents.map((document) => <article className="panel" key={document.id}><span className="badge">{document.kind}</span><h2>{document.title}</h2><p>{document.excerpt}</p><p className="muted"><code>{document.relative_path}</code></p><Link className="button secondary" href={`/api/documents?path=${encodeURIComponent(document.relative_path)}`}>Open source</Link></article>)}</section>
  </main>;
}
