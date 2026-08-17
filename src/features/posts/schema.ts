import { z } from "zod";
import { POST_STATUSES } from "./types";

export const postInputSchema = z.object({
  id: z.string().uuid(),
  expectedSourceHash: z.string().length(64),
  title: z.string().trim().min(1).max(200),
  content: z.string().max(30000),
  platform: z.enum(["linkedin", "other"]),
  status: z.enum(POST_STATUSES),
  postType: z.string().trim().min(1).max(80).default("original"),
  sourceUrl: z.union([z.literal(""), z.url()]).optional(),
  targetDate: z.union([z.literal(""), z.iso.date()]).optional(),
  liveUrl: z.union([z.literal(""), z.url()]).optional(),
});

export const createPostSchema = postInputSchema.omit({ id: true, expectedSourceHash: true }).extend({
  status: z.enum(["draft", "needs_changes", "ready_for_review"]).default("draft"),
});

export const commentSchema = z.object({
  postId: z.string().uuid(),
  body: z.string().trim().min(1).max(10000),
});
