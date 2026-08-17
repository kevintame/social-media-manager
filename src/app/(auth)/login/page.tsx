import { loginAction } from "@/features/posts/actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="login"><section className="panel">
    <p className="muted">Kevin’s private workspace</p>
    <h1>Social Content Manager</h1>
    <p className="muted">Sign in with one of the local workspace accounts.</p>
    {error && <p className="notice error" role="alert">{error}</p>}
    <form action={loginAction}>
      <label>Email<input name="email" type="email" autoComplete="email" defaultValue="kevin@example.test" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <button type="submit">Sign in</button>
    </form>
  </section></main>;
}
