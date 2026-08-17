import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanVault } from "@/features/sync/sync";

export async function POST(request: Request) {
  await requireUser();
  if (request.headers.get("x-social-sync") !== "poll") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { data: state } = await createAdminClient().from("sync_state").select("last_completed_at,status").eq("id", true).single();
  if (!state?.last_completed_at || state.status === "scanning") return NextResponse.json({ skipped: true });
  // Polling is deliberately read-only. Assigning IDs, invalidating approvals,
  // and refreshing the server-side projection require an explicit sync commit.
  try { return NextResponse.json(await scanVault(false)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
