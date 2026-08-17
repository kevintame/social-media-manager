export const POST_STATUSES = ["draft", "needs_changes", "ready_for_review", "approved", "posted"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export type ParsedPost = {
  id?: string;
  sourcePath: string;
  locator: string;
  title: string;
  platform: "linkedin" | "other";
  status: PostStatus;
  content: string;
  postType: string;
  sourceUrl?: string;
  targetDate?: string;
  recommendedTime?: string;
  metadata: Record<string, string>;
  approvedBy?: string;
  approvedAt?: string;
  approvedContentHash?: string;
  publishedAt?: string;
  liveUrl?: string;
  mediaPaths: string[];
};

export type VaultDocument = {
  relativePath: string;
  kind: "post" | "daily_bundle" | "strategy" | "idea" | "template" | "wrapper" | "source" | "published" | "other";
  title: string;
  excerpt: string;
  content: string;
  hash: string;
  sizeBytes: number;
  modifiedAt: string;
  posts: ParsedPost[];
};
