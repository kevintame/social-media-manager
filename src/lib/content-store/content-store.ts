import type { VaultDocument } from "@/features/posts/types";

export type ScanOptions = { assignMissingIds?: boolean };
export type PatchPostInput = {
  id: string;
  sourcePath: string;
  locator: string;
  expectedSourceHash: string;
  title: string;
  content: string;
  status: string;
  platform: string;
  postType: string;
  sourceUrl?: string;
  targetDate?: string;
  approvedBy?: string;
  approvedAt?: string;
  approvedContentHash?: string;
  publishedAt?: string;
  liveUrl?: string;
  mediaPaths?: string[];
};

export interface ContentStore {
  scan(options?: ScanOptions): Promise<VaultDocument[]>;
  read(relativePath: string): Promise<Buffer>;
  createPost(input: Omit<PatchPostInput, "sourcePath" | "locator" | "expectedSourceHash">): Promise<VaultDocument>;
  patchPost(input: PatchPostInput): Promise<VaultDocument>;
  resolveMedia(relativePath: string): Promise<string>;
  recordPublication(input: { id: string; title: string; platform: string; contentHash: string; publishedAt: string; liveUrl?: string }): Promise<string>;
  writeMedia(postId: string, fileName: string, data: Buffer): Promise<{ relativePath: string; fileName: string; mimeType: string; sizeBytes: number; contentHash: string }>;
  removeMedia(relativePath: string): Promise<void>;
}

export class ContentConflictError extends Error {
  constructor() {
    super("The source file changed since this page was loaded. Rescan and review the newer version before saving.");
    this.name = "ContentConflictError";
  }
}
