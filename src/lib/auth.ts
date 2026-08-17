import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}
