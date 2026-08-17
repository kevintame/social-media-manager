import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { signOutAction } from "@/features/posts/actions";
import { VaultReconciler } from "@/components/vault-reconciler";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <div className="shell">
    <VaultReconciler />
    <header className="topbar">
      <Link href="/posts" className="brand">Social Content Manager</Link>
      <nav className="nav" aria-label="Main navigation">
        <Link href="/posts">Posts</Link><Link href="/wrappers">Wrappers</Link><Link href="/library">Vault library</Link><Link href="/import">Sync</Link>
        <form action={signOutAction}><button type="submit" title={user.email}>Sign out</button></form>
      </nav>
    </header>
    {children}
  </div>;
}
