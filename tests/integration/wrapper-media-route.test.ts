import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  maybeSingle: vi.fn(),
  read: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ is: () => ({ maybeSingle: mocks.maybeSingle }) }) }) }),
  }),
}));
vi.mock("@/lib/content-store/filesystem", () => ({ getContentStore: () => ({ read: mocks.read }) }));

import { GET } from "@/app/api/wrappers/[slug]/media/route";

describe("wrapper media route", () => {
  beforeEach(() => {
    mocks.requireUser.mockReset().mockResolvedValue(undefined);
    mocks.read.mockReset().mockResolvedValue(Buffer.from("0123456789"));
    mocks.maybeSingle.mockReset().mockResolvedValue({ data: {
      media_relative_path: "Wrappers/example.mp4",
      media_mime_type: "video/mp4",
      media_file_name: "example.mp4",
      media_size_bytes: 10,
    } });
  });

  it("serves a valid byte range for video playback", async () => {
    const response = await GET(new Request("http://localhost/api/wrappers/example/media", { headers: { range: "bytes=2-5" } }), { params: Promise.resolve({ slug: "example" }) });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(response.headers.get("content-type")).toBe("video/mp4");
    await expect(response.text()).resolves.toBe("2345");
  });

  it("rejects an invalid byte range", async () => {
    const response = await GET(new Request("http://localhost/api/wrappers/example/media", { headers: { range: "bytes=20-30" } }), { params: Promise.resolve({ slug: "example" }) });
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */10");
  });

  it("returns 404 when the wrapper is unavailable", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null });
    const response = await GET(new Request("http://localhost/api/wrappers/missing/media"), { params: Promise.resolve({ slug: "missing" }) });
    expect(response.status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
