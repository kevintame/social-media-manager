import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase URL and service-role key must be set in .env");

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const users = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    email: process.env.LOCAL_KEVIN_EMAIL,
    password: process.env.LOCAL_KEVIN_PASSWORD,
    displayName: "Kevin",
    canApprove: true,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    email: process.env.LOCAL_MANAGER_EMAIL,
    password: process.env.LOCAL_MANAGER_PASSWORD,
    displayName: "Social Media Manager",
    canApprove: false,
  },
];

for (const user of users) {
  if (!user.email || !user.password) throw new Error("Local account email/password values are missing from .env");
  const { error } = await supabase.auth.admin.createUser({
    id: user.id,
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { display_name: user.displayName },
  });
  if (error && !error.message.toLowerCase().includes("already")) throw error;
  const { error: profileError } = await supabase.from("profiles").upsert({ id: user.id, display_name: user.displayName, can_approve: user.canApprove });
  if (profileError) throw profileError;
}

process.stdout.write("Seeded local workspace users from .env.\n");
