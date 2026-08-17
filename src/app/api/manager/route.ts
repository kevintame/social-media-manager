import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getContentStore } from "@/lib/content-store/filesystem";
import { commitVaultSync, reconcileVaultProjection } from "@/features/sync/sync";
import { createManagerService, ManagerOperationError } from "@/features/manager/core";
import { createSupabaseManagerRepository } from "@/features/manager/repository";

export const runtime = "nodejs";

const uuid = z.string().uuid();
const boundedLimit = z.number().int().min(1).max(250).default(50);
const mediaPath = z.string().trim().min(1).max(500).refine((value) => !value.startsWith("/") && !value.split("/").includes(".."), "Media paths must be safe vault-relative paths");
const draft = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().max(30000),
  platform: z.enum(["linkedin", "other"]).default("linkedin"),
  postType: z.string().trim().min(1).max(80).default("original"),
  sourceUrl: z.union([z.literal(""), z.url()]).optional(),
  targetDate: z.union([z.literal(""), z.iso.date()]).optional(),
  recommendedTime: z.string().trim().max(100).optional(),
  metadata: z.record(z.string().max(100), z.string().max(2000)).refine((value) => Object.keys(value).length <= 50, "At most 50 metadata fields are allowed").optional(),
  mediaPaths: z.array(mediaPath).max(20).optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});
const expected = z.object({ id: uuid, expectedSourceHash: z.string().regex(/^[a-f0-9]{64}$/) });

const envelopeSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("list_posts"), input: z.object({ q: z.string().trim().max(200).optional(), status: z.enum(["draft", "needs_changes", "ready_for_review", "approved", "posted"]).optional(), limit: boundedLimit }).default({ limit: 50 }) }),
  z.object({ operation: z.literal("get_post"), input: z.object({ id: uuid }) }),
  z.object({ operation: z.literal("create_draft"), input: draft }),
  z.object({ operation: z.literal("update_draft"), input: expected.merge(draft.omit({ idempotencyKey: true }).partial()) }),
  z.object({ operation: z.literal("submit_for_review"), input: expected }),
  z.object({ operation: z.literal("add_comment"), input: z.object({ postId: uuid, body: z.string().trim().min(1).max(10000) }) }),
  z.object({ operation: z.literal("list_comments"), input: z.object({ postId: uuid, limit: boundedLimit }) }),
  z.object({ operation: z.literal("list_activity"), input: z.object({ postId: uuid.optional(), limit: boundedLimit }).default({ limit: 50 }) }),
  z.object({ operation: z.literal("sync_dry_run"), input: z.object({}).default({}) }),
  z.object({ operation: z.literal("sync_commit"), input: z.object({ planToken: z.string().regex(/^[a-f0-9]{64}$/), confirmation: z.literal("CONFIRM_SYNC") }) }),
]);

type Envelope = z.infer<typeof envelopeSchema>;

function jsonError(requestId: string, code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ ok: false, requestId, error: { code, message, ...(details === undefined ? {} : { details }) } }, { status });
}

function isLoopback(request: Request) {
  try {
    // In the development container Next reconstructs request.url with its
    // internal 0.0.0.0 bind address. The incoming Host header still carries
    // the loopback-only published authority, so prefer it when available.
    const authority = request.headers.get("host");
    const hostname = (authority ? new URL(`http://${authority}`) : new URL(request.url))
      .hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function tokenMatches(actual: string, expected: string) {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function authenticate(request: Request) {
  if (!isLoopback(request)) throw new ManagerOperationError("LOCALHOST_ONLY", "Manager API is only available on localhost", 403);
  const expectedToken = process.env.HERMES_MANAGER_TOKEN;
  const userId = process.env.HERMES_MANAGER_USER_ID;
  if (!expectedToken || !userId) throw new ManagerOperationError("MANAGER_API_DISABLED", "Manager API credentials are not configured", 503);
  if (expectedToken.length < 32 || expectedToken.toLowerCase().includes("replace") || !uuid.safeParse(userId).success) throw new ManagerOperationError("MANAGER_API_MISCONFIGURED", "Manager API credentials are invalid", 503);
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!supplied || !tokenMatches(supplied, expectedToken)) throw new ManagerOperationError("UNAUTHORIZED", "Invalid bearer token", 401);
  const profile = await createSupabaseManagerRepository().getProfile(userId);
  if (!profile) throw new ManagerOperationError("MANAGER_IDENTITY_INVALID", "Configured manager profile does not exist", 403);
  if (profile.can_approve) throw new ManagerOperationError("MANAGER_IDENTITY_INVALID", "The manager API cannot run as an approver", 403);
  return profile.id;
}

async function execute(envelope: Envelope, userId: string) {
  const repository = createSupabaseManagerRepository();
  const service = createManagerService({
    repository,
    store: getContentStore(),
    reconcileProjection: reconcileVaultProjection,
    commitSync: commitVaultSync,
  });
  switch (envelope.operation) {
    case "list_posts": return service.listPosts(envelope.input);
    case "get_post": return service.getPost(envelope.input.id);
    case "create_draft": return service.createDraft(userId, envelope.input);
    case "update_draft": return service.updateDraft(userId, envelope.input);
    case "submit_for_review": return service.submitForReview(userId, envelope.input);
    case "add_comment": return service.addComment(userId, envelope.input.postId, envelope.input.body);
    case "list_comments": return service.listComments(envelope.input.postId, envelope.input.limit);
    case "list_activity": return service.listActivity(envelope.input.postId, envelope.input.limit);
    case "sync_dry_run": return service.syncDryRun();
    case "sync_commit": return service.syncCommit(userId, envelope.input.planToken, envelope.input.confirmation);
  }
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const userId = await authenticate(request);
    let body: unknown;
    try { body = await request.json(); }
    catch { return jsonError(requestId, "INVALID_JSON", "Request body must be valid JSON", 400); }
    const parsed = envelopeSchema.safeParse(body);
    if (!parsed.success) return jsonError(requestId, "VALIDATION_ERROR", "Invalid manager operation envelope", 400, parsed.error.flatten());
    const data = await execute(parsed.data, userId);
    return NextResponse.json({ ok: true, requestId, operation: parsed.data.operation, data });
  } catch (error) {
    if (error instanceof ManagerOperationError) return jsonError(requestId, error.code, error.message, error.status, error.details);
    console.error("Manager API error", { requestId, error });
    return jsonError(requestId, "INTERNAL_ERROR", "Manager operation failed", 500);
  }
}
