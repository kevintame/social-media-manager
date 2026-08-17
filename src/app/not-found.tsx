import Link from "next/link";
export default function NotFound() { return <main className="narrow"><section className="panel"><h1>Not found</h1><p>The requested content does not exist or has not been synchronized.</p><Link className="button" href="/posts">Back to posts</Link></section></main>; }
