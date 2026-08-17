import { STATUS_META } from "@/features/posts/status";
import type { PostStatus } from "@/features/posts/types";

export function StatusBadge({ status }: { status: PostStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.draft;
  return <span className={`badge ${meta.tone}`}>{meta.label}</span>;
}
