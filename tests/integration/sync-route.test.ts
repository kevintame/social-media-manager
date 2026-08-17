import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  scanVault: vi.fn(),
  single: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/features/sync/sync", () => ({ scanVault: mocks.scanVault }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: mocks.single })),
      })),
    })),
  }),
}));

import { POST } from "@/app/api/sync/route";

describe("automatic sync polling", () => {
  beforeEach(() => {
    mocks.requireUser.mockReset().mockResolvedValue(undefined);
    mocks.single.mockReset().mockResolvedValue({
      data: { last_completed_at: "2026-08-17T12:00:00.000Z", status: "idle" },
    });
    mocks.scanVault.mockReset().mockResolvedValue({ documents: 1, posts: 1, missingIds: 1, paths: ["drafts/active/legacy.md"] });
  });

  it("uses only the explicitly read-only vault scan", async () => {
    const response = await POST(new Request("http://127.0.0.1:3000/api/sync", {
      method: "POST",
      headers: { "x-social-sync": "poll" },
    }));

    expect(response.status).toBe(200);
    expect(mocks.scanVault).toHaveBeenCalledOnce();
    expect(mocks.scanVault).toHaveBeenCalledWith(false);
    await expect(response.json()).resolves.toMatchObject({ missingIds: 1 });
  });
});
