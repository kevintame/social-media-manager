"use client";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main className="narrow"><section className="panel"><h1>Something went wrong</h1><p className="muted">The vault was not changed unless a success message was shown.</p><button onClick={reset}>Try again</button></section></main>; }
