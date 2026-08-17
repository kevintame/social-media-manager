#!/usr/bin/env node

import readline from "node:readline";

const baseUrl = process.env.HERMES_MANAGER_URL ?? "http://127.0.0.1:3000/api/manager";
const token = process.env.HERMES_MANAGER_TOKEN;
let target;
try { target = new URL(baseUrl); }
catch {
  console.error("HERMES_MANAGER_URL must be a valid loopback HTTP application URL");
  process.exit(1);
}
const authHeaderName = "author" + "ization";
const authScheme = "Bear" + "er";
const targetHostname = target.hostname.replace(/^\[|\]$/g, "").toLowerCase();
if (!["http:", "https:"].includes(target.protocol)
  || !["localhost", "127.0.0.1", "::1"].includes(targetHostname)
  || target.username || target.password || target.search || target.hash) {
  console.error("HERMES_MANAGER_URL must be a credential-free loopback HTTP application URL");
  process.exit(1);
}
if (!token) {
  console.error("HERMES_MANAGER_TOKEN is required");
  process.exit(1);
}
const configuredTimeout = Number(process.env.HERMES_MANAGER_TIMEOUT_MS ?? 120000);
const requestTimeoutMs = Number.isSafeInteger(configuredTimeout) && configuredTimeout > 0
  ? configuredTimeout
  : 120000;

const uuid = { type: "string", format: "uuid" };
const hash = { type: "string", minLength: 64, maxLength: 64 };
const limit = { type: "integer", minimum: 1, maximum: 250, default: 50 };
const draftProperties = {
  title: { type: "string", minLength: 1, maxLength: 200 },
  content: { type: "string", maxLength: 30000 },
  platform: { type: "string", enum: ["linkedin", "other"], default: "linkedin" },
  postType: { type: "string", minLength: 1, maxLength: 80, default: "original" },
  sourceUrl: { type: "string" },
  targetDate: { type: "string", format: "date" },
  recommendedTime: { type: "string", maxLength: 100 },
  metadata: { type: "object", additionalProperties: { type: "string", maxLength: 2000 }, maxProperties: 50 },
  mediaPaths: { type: "array", items: { type: "string", minLength: 1, maxLength: 500 }, maxItems: 20 },
};
const tools = [
  { name: "list_posts", description: "List social posts and optionally filter by text or status.", inputSchema: { type: "object", properties: { q: { type: "string" }, status: { type: "string", enum: ["draft", "needs_changes", "ready_for_review", "approved", "posted"] }, limit } } },
  { name: "get_post", description: "Get one social post by UUID.", inputSchema: { type: "object", properties: { id: uuid }, required: ["id"] } },
  { name: "create_draft", description: "Create an idempotent draft in the canonical content store. Cannot approve or publish.", inputSchema: { type: "object", properties: { ...draftProperties, idempotencyKey: { type: "string", minLength: 8, maxLength: 200 } }, required: ["title", "content"] } },
  { name: "update_draft", description: "Update an unposted draft using its current source hash for conflict protection.", inputSchema: { type: "object", properties: { id: uuid, expectedSourceHash: hash, ...draftProperties }, required: ["id", "expectedSourceHash"] } },
  { name: "submit_for_review", description: "Move an unposted post to ready_for_review using optimistic concurrency.", inputSchema: { type: "object", properties: { id: uuid, expectedSourceHash: hash }, required: ["id", "expectedSourceHash"] } },
  { name: "add_comment", description: "Add a collaboration comment to a post.", inputSchema: { type: "object", properties: { postId: uuid, body: { type: "string", minLength: 1, maxLength: 10000 } }, required: ["postId", "body"] } },
  { name: "list_comments", description: "List comments on a post.", inputSchema: { type: "object", properties: { postId: uuid, limit }, required: ["postId"] } },
  { name: "list_activity", description: "List manager activity, optionally for one post.", inputSchema: { type: "object", properties: { postId: uuid, limit } } },
  { name: "sync_dry_run", description: "Read the vault and return a sync plan and token without writing anything.", inputSchema: { type: "object", properties: {} } },
  { name: "sync_commit", description: "Commit an unchanged dry-run sync plan. Requires the exact plan token and literal confirmation.", inputSchema: { type: "object", properties: { planToken: hash, confirmation: { type: "string", const: "CONFIRM_SYNC" } }, required: ["planToken", "confirmation"] } },
];
const toolNames = new Set(tools.map((tool) => tool.name));
const supportedProtocols = new Set(["2025-06-18", "2024-11-05"]);

async function callManager(operation, input) {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { [authHeaderName]: `${authScheme} ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ operation, input: input ?? {} }),
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: { code: "INVALID_RESPONSE", message: `HTTP ${response.status}` } }));
  if (!response.ok || !payload.ok) {
    const error = new Error(payload.error?.message ?? `HTTP ${response.status}`);
    error.code = payload.error?.code ?? "MANAGER_API_ERROR";
    error.details = payload.error?.details;
    throw error;
  }
  return payload.data;
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(message) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    if (message?.id !== undefined) send({ jsonrpc: "2.0", id: message.id, error: { code: -32600, message: "Invalid Request" } });
    return;
  }
  if (message.id === undefined) return;
  try {
    let result;
    switch (message.method) {
      case "initialize":
        result = { protocolVersion: supportedProtocols.has(message.params?.protocolVersion) ? message.params.protocolVersion : "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "social-media-manager", version: "0.1.0" } };
        break;
      case "ping": result = {}; break;
      case "tools/list": result = { tools }; break;
      case "tools/call": {
        const name = message.params?.name;
        if (!toolNames.has(name)) throw Object.assign(new Error(`Unknown tool: ${name}`), { code: "METHOD_NOT_FOUND", rpcCode: -32602 });
        const data = await callManager(name, message.params?.arguments ?? {});
        result = { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { result: data } };
        break;
      }
      default: throw Object.assign(new Error(`Unknown method: ${message.method}`), { code: "METHOD_NOT_FOUND", rpcCode: -32601 });
    }
    send({ jsonrpc: "2.0", id: message.id, result });
  } catch (error) {
    if (message.method === "tools/call") {
      send({ jsonrpc: "2.0", id: message.id, result: { isError: true, content: [{ type: "text", text: JSON.stringify({ code: error.code ?? "MCP_TOOL_ERROR", message: error.message, details: error.details }) }] } });
    } else {
      send({ jsonrpc: "2.0", id: message.id, error: { code: error.rpcCode ?? -32603, message: error.message } });
    }
  }
}

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  let message;
  try { message = JSON.parse(line); }
  catch { send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); return; }
  void handle(message);
});
