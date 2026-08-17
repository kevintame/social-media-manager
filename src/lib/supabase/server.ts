import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (values) => {
          try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* Server Components cannot set cookies. Proxy refreshes them. */ }
        },
      },
    },
  );
}
