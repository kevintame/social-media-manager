import { syncAction } from "@/features/posts/actions";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ result?: string; mode?: string; error?: string }> }) {
  const query = await searchParams;
  let result: { documents: number; posts: number; missingIds: number; paths: string[] } | null = null;
  try { result = query.result ? JSON.parse(query.result) : null; } catch { result = null; }
  return <main className="narrow"><header className="page-head"><div><h1>Vault synchronization</h1><p className="muted">Preview first. Commit writes stable IDs where needed, refreshes the Supabase index, and invalidates stale approvals.</p></div></header>
    {query.error && <p className="notice error">{query.error}</p>}
    {result && <section className="panel"><h2>{query.mode === "commit" ? "Synchronization complete" : "Dry-run result"}</h2><p><strong>{result.documents}</strong> documents and <strong>{result.posts}</strong> posts found.</p><p><strong>{result.missingIds}</strong> posts need stable IDs.</p>{result.paths.length > 0 && <details><summary>Files requiring IDs</summary><ul>{result.paths.map((path) => <li key={path}><code>{path}</code></li>)}</ul></details>}</section>}
    <section className="panel" style={{ marginTop: "1rem" }}><h2>Run scan</h2><p>A dry run reads the vault and makes no changes. Commit is the explicit import step.</p><div className="actions"><form action={syncAction}><input type="hidden" name="commit" value="false" /><button className="secondary" type="submit">Dry run</button></form><form action={syncAction}><input type="hidden" name="commit" value="true" /><button type="submit">Commit sync</button></form></div></section>
  </main>;
}
