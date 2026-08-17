import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getContentStore } from "@/lib/content-store/filesystem";

export async function GET(request: NextRequest) {
  await requireUser();
  const relativePath = request.nextUrl.searchParams.get("path");
  if (!relativePath) return NextResponse.json({ error: "Missing path" }, { status: 400 });
  try {
    const data = await getContentStore().read(relativePath);
    return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": relativePath.endsWith(".md") ? "text/markdown; charset=utf-8" : "application/octet-stream", "Content-Disposition": `inline; filename=\"${relativePath.split("/").at(-1)?.replaceAll('"', '')}\"`, "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
