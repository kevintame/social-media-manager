import type { PostStatus } from "./types";

export const STATUS_META: Record<PostStatus, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "neutral" },
  needs_changes: { label: "Needs changes", tone: "danger" },
  ready_for_review: { label: "Ready for Kevin review", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  posted: { label: "Posted", tone: "brand" },
};

export function normalizeStatus(value: unknown): PostStatus {
  const normalized = String(value ?? "draft").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (normalized === "ready_for_kevin_review" || normalized === "ready_to_post") return "ready_for_review";
  if (["draft", "needs_changes", "ready_for_review", "approved", "posted"].includes(normalized)) {
    return normalized as PostStatus;
  }
  return "draft";
}
