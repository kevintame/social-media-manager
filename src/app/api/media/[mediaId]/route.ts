import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContentStore } from "@/lib/content-store/filesystem";

export async function GET(_request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  await requireUser();
  const { mediaId } = await params;
  const { data: media } = await createAdminClient().from("post_media").select("relative_path,mime_type,file_name").eq("id", mediaId).single();
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const data = await getContentStore().read(media.relative_path);
    return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": media.mime_type, "Content-Disposition": `inline; filename=\"${media.file_name.replaceAll('"', '')}\"`, "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Not found" }, { status: 404 }); }
}
