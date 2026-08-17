import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  listPosts: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/content-store/filesystem", () => ({ getContentStore: () => ({}) }));
vi.mock("@/features/sync/sync", () => ({
  commitVaultSync: vi.fn(),
  reconcileVaultProjection: vi.fn(),
}));
vi.mock("@/features/manager/repository", () => ({
  createSupabaseManagerRepository: () => ({
    getProfile: mocks.getProfile,
    listPosts: mocks.listPosts,
  }),
}));

import { POST } from "@/app/api/manager/route";

const TOKEN = "test-manager-token-that-is-longer-than-32-characters";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function request(hostname = "127.0.0.1", token = TOKEN) {
  return new Request(`http://${hostname}:3000/api/manager`, {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({ operation: "list_posts", input: {} }),
  });
}

async function errorCode(response: Response) {
  const payload = await response.json() as { error: { code: string } };
  return payload.error.code;
}

describe("manager API authentication and authorization", () => {
  beforeEach(() => {
    vi.stubEnv("HERMES_MANAGER_TOKEN", TOKEN);
    vi.stubEnv("HERMES_MANAGER_USER_ID", USER_ID);
    mocks.getProfile.mockReset();
    mocks.listPosts.mockReset();
    mocks.getProfile.mockResolvedValue({ id: USER_ID, can_approve: false });
    mocks.listPosts.mockResolvedValue([]);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("rejects non-loopback application URLs before authentication", async () => {
    const response = await POST(request("example.test"));
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("LOCALHOST_ONLY");
    expect(mocks.getProfile).not.toHaveBeenCalled();
  });

  it("accepts the loopback Host authority when Next uses the container bind address", async () => {
    const containerRequest = new Request("http://0.0.0.0:3000/api/manager", {
      method: "POST",
      headers: { host: "127.0.0.1:3000", authorization: "Bearer " + TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ operation: "list_posts", input: {} }),
    });
    const response = await POST(containerRequest);
    expect(response.status).toBe(200);
  });

  it("fails safely when credentials are absent or malformed", async () => {
    vi.stubEnv("HERMES_MANAGER_TOKEN", "");
    let response = await POST(request());
    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe("MANAGER_API_DISABLED");

    vi.stubEnv("HERMES_MANAGER_TOKEN", "replace-with-a-real-manager-token-value");
    response = await POST(request("127.0.0.1", "replace-with-a-real-manager-token-value"));
    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe("MANAGER_API_MISCONFIGURED");
  });

  it("rejects an invalid bearer token without looking up the profile", async () => {
    const response = await POST(request("localhost", `${TOKEN}-wrong`));
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("UNAUTHORIZED");
    expect(mocks.getProfile).not.toHaveBeenCalled();
  });

  it("requires an existing fixed non-approver profile", async () => {
    mocks.getProfile.mockResolvedValueOnce(null);
    let response = await POST(request());
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("MANAGER_IDENTITY_INVALID");

    mocks.getProfile.mockResolvedValueOnce({ id: USER_ID, can_approve: true });
    response = await POST(request());
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("MANAGER_IDENTITY_INVALID");
  });

  it("returns a stable success envelope for the configured non-approver", async () => {
    const response = await POST(request("[::1]"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      operation: "list_posts",
      data: [],
    });
  });
});
