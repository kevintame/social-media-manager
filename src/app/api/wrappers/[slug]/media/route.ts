import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContentStore } from "@/lib/content-store/filesystem";

function safeFileName(value: string) {
  return value.replace(/["\r\n]/g, "");
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const { data: wrapper } = await createAdminClient().from("wrappers")
    .select("media_relative_path,media_mime_type,media_file_name,media_size_bytes,documents!inner(deleted_at)")
    .eq("slug", slug).is("documents.deleted_at", null).maybeSingle();
  if (!wrapper) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const data = await getContentStore().read(wrapper.media_relative_path);
    const range = request.headers.get("range");
    const headers = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${safeFileName(wrapper.media_file_name)}"`,
      "Content-Type": wrapper.media_mime_type,
    };
    if (!range) return new NextResponse(new Uint8Array(data), { headers: { ...headers, "Content-Length": String(data.length) } });
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!match) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${data.length}` } });
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), data.length - 1) : data.length - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= data.length) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${data.length}` } });
    }
    const chunk = data.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(chunk), { status: 206, headers: { ...headers, "Content-Length": String(chunk.length), "Content-Range": `bytes ${start}-${end}/${data.length}` } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
