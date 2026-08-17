import { syncAction } from "@/features/posts/actions";

type SyncPlan = {
  planToken: string;
  summary: {
    documents: number; posts: number; wrappers: number; missingIds: number; approvalInvalidations: number;
    projectionAdds: number; projectionUpdates: number; projectionRemovals: number;
  };
  proposedChanges: {
    assignIdsIn: string[]; invalidateApprovalFor: string[]; addDocuments: string[];
    updateDocuments: string[]; removeDocuments: string[]; addPosts: string[];
    updatePosts: string[]; stalePostIds: string[]; addWrappers: string[];
    updateWrappers: string[]; removeWrappers: string[];
  };
};

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ result?: string; mode?: string; error?: string }> }) {
  const query = await searchParams;
  let result: SyncPlan | null = null;
  try { result = query.result ? JSON.parse(query.result) : null; } catch { result = null; }
  const changes = result ? Object.entries(result.proposedChanges).filter(([, values]) => values.length > 0) : [];
  return <main className="narrow">
    <header className="page-head"><div><h1>Vault synchronization</h1><p className="muted">Preview first. Commit writes stable IDs where needed, refreshes the Supabase index, and invalidates stale approvals.</p></div></header>
    {query.error && <p className="notice error">{query.error}</p>}
    {result && <section className="panel">
      <h2>{query.mode === "commit" ? "Synchronization complete" : "Dry-run result"}</h2>
      <p><strong>{result.summary.documents}</strong> documents, <strong>{result.summary.posts}</strong> posts, and <strong>{result.summary.wrappers}</strong> wrappers found.</p>
      <ul>
        <li>{result.summary.missingIds} stable IDs to assign</li>
        <li>{result.summary.approvalInvalidations} approvals to invalidate</li>
        <li>{result.summary.projectionAdds} projection additions</li>
        <li>{result.summary.projectionUpdates} projection updates</li>
        <li>{result.summary.projectionRemovals} projection removals or stale posts</li>
      </ul>
      {changes.length > 0 ? <details><summary>Exact proposed changes</summary>{changes.map(([label, values]) => <div key={label}><strong>{label}</strong><ul>{values.map((value) => <li key={value}><code>{value}</code></li>)}</ul></div>)}</details> : <p className="muted">No changes are proposed.</p>}
      {query.mode !== "commit" && <form action={syncAction} style={{ marginTop: "1rem" }}>
        <input type="hidden" name="commit" value="true" />
        <input type="hidden" name="planToken" value={result.planToken} />
        <input type="hidden" name="confirmation" value="CONFIRM_SYNC" />
        <button type="submit">Commit this exact sync plan</button>
      </form>}
    </section>}
    <section className="panel" style={{ marginTop: "1rem" }}><h2>Run scan</h2><p>A dry run reads the vault and projection and makes no changes. A commit button appears only for the exact reviewed plan.</p><form action={syncAction}><input type="hidden" name="commit" value="false" /><button className="secondary" type="submit">Dry run</button></form></section>
  </main>;
}
