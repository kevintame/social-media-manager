import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

const children: ChildProcessWithoutNullStreams[] = [];
const servers: Server[] = [];

afterEach(async () => {
  for (const child of children.splice(0)) child.kill();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  })));
});

function nextMessage(child: ChildProcessWithoutNullStreams): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for MCP response")), 3000);
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      clearTimeout(timeout);
      resolve(JSON.parse(buffer.slice(0, newline)) as Record<string, unknown>);
    });
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("exit", (code) => {
      if (code !== null && code !== 0) { clearTimeout(timeout); reject(new Error(`MCP adapter exited with ${code}`)); }
    });
  });
}

describe("Hermes manager MCP adapter", () => {
  it("starts, negotiates, and lists the restricted tool surface", async () => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts", "hermes-manager-mcp.mjs")], {
      env: { ...process.env, HERMES_MANAGER_TOKEN: "test-token-that-is-at-least-32-characters" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    children.push(child);

    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } })}\n`);
    const initialized = await nextMessage(child);
    expect(initialized).toMatchObject({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } });

    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
    const listed = await nextMessage(child);
    const names = ((listed.result as { tools: { name: string }[] }).tools).map((tool) => tool.name);
    expect(names).toEqual([
      "list_posts", "get_post", "create_draft", "update_draft", "submit_for_review",
      "add_comment", "list_comments", "list_activity", "sync_dry_run", "sync_commit",
    ]);
    expect(names).not.toContain("approve_post");
    expect(names).not.toContain("publish_post");
  });

  it("calls the loopback application API without exposing its bearer token", async () => {
    const token = "smoke-test-token-that-is-at-least-32-characters";
    let receivedAuthorization = "";
    let receivedBody: unknown;
    const server = createServer((request, response) => {
      receivedAuthorization = request.headers.authorization ?? "";
      let raw = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { raw += chunk; });
      request.on("end", () => {
        receivedBody = JSON.parse(raw);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true, data: [{ id: "fixture-post" }] }));
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts", "hermes-manager-mcp.mjs")], {
      env: {
        ...process.env,
        HERMES_MANAGER_TOKEN: token,
        HERMES_MANAGER_URL: `http://127.0.0.1:${port}/api/manager`,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    children.push(child);

    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_posts", arguments: { limit: 1 } } })}\n`);
    const called = await nextMessage(child);

    expect(receivedAuthorization).toBe(`Bearer ${token}`);
    expect(receivedBody).toEqual({ operation: "list_posts", input: { limit: 1 } });
    expect(called).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { structuredContent: { result: [{ id: "fixture-post" }] } },
    });
    expect(JSON.stringify(called)).not.toContain(token);
  });
});
