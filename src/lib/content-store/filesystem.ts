import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import lockfile from "proper-lockfile";
import type { ContentStore, PatchPostInput, ScanOptions } from "./content-store";
import { ContentConflictError } from "./content-store";
import { assignIds, invalidateChangedApprovals, parseMarkdown, patchMarkdownPost, renderSinglePost, sha256 } from "./markdown";
import type { VaultDocument } from "@/features/posts/types";

const SCAN_ROOTS = ["drafts", "published", "strategy", "ideas", "templates", "Wrappers", "sources"];

export class FilesystemContentStore implements ContentStore {
  constructor(private readonly root: string) {}

  private async safePath(relativePath: string, mustExist = true): Promise<string> {
    if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(path.sep).includes("..")) throw new Error("Unsafe vault path");
    const rootReal = await fs.realpath(this.root);
    const candidate = path.resolve(rootReal, relativePath);
    const parentReal = await fs.realpath(mustExist ? candidate : path.dirname(candidate));
    if (parentReal !== rootReal && !parentReal.startsWith(`${rootReal}${path.sep}`)) throw new Error("Path escapes the vault");
    return candidate;
  }

  async read(relativePath: string): Promise<Buffer> {
    return fs.readFile(await this.safePath(relativePath));
  }

  async scan(options: ScanOptions = {}): Promise<VaultDocument[]> {
    const files: string[] = [];
    const walk = async (relativeDir: string) => {
      const absolute = await this.safePath(relativeDir);
      for (const entry of await fs.readdir(absolute, { withFileTypes: true })) {
        const relative = path.posix.join(relativeDir, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) await walk(relative);
        else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(relative);
      }
    };
    for (const root of SCAN_ROOTS) {
      try { await walk(root); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }

    const documents: VaultDocument[] = [];
    for (const relative of files.sort()) {
      const absolute = await this.safePath(relative);
      let raw = await fs.readFile(absolute, "utf8");
      let stat = await fs.stat(absolute);
      let document = parseMarkdown(relative, raw, stat);
      if (options.assignMissingIds && document.posts.some((post) => !post.id)) {
        const assigned = assignIds(raw, document);
        if (assigned.assigned) {
          await this.atomicWrite(absolute, assigned.raw);
          raw = assigned.raw;
          stat = await fs.stat(absolute);
          document = parseMarkdown(relative, raw, stat);
        }
      }
      if (options.assignMissingIds) {
        const invalidated = invalidateChangedApprovals(raw, document);
        if (invalidated.changed) {
          await this.atomicWrite(absolute, invalidated.raw);
          raw = invalidated.raw;
          stat = await fs.stat(absolute);
          document = parseMarkdown(relative, raw, stat);
        }
      }
      documents.push(document);
    }
    return documents;
  }

  async createPost(input: Omit<PatchPostInput, "sourcePath" | "locator" | "expectedSourceHash">): Promise<VaultDocument> {
    const slug = input.title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || input.id;
    const directory = await this.safePath("drafts/active");
    const relative = `drafts/active/${slug}-${input.id.slice(0, 8)}.md`;
    const absolute = path.join(directory, path.basename(relative));
    const raw = renderSinglePost(input);
    await fs.writeFile(absolute, raw, { encoding: "utf8", flag: "wx" });
    return parseMarkdown(relative, raw, await fs.stat(absolute));
  }

  async patchPost(input: PatchPostInput): Promise<VaultDocument> {
    const absolute = await this.safePath(input.sourcePath);
    const release = await lockfile.lock(absolute, { retries: { retries: 4, minTimeout: 50 } });
    try {
      const raw = await fs.readFile(absolute, "utf8");
      if (sha256(raw) !== input.expectedSourceHash) throw new ContentConflictError();
      const output = patchMarkdownPost(raw, input);
      await this.atomicWrite(absolute, output);
      return parseMarkdown(input.sourcePath, output, await fs.stat(absolute));
    } finally {
      await release();
    }
  }

  async resolveMedia(relativePath: string): Promise<string> {
    return this.safePath(relativePath);
  }

  async writeMedia(postId: string, fileName: string, data: Buffer) {
    if (!/^[0-9a-f-]{36}$/i.test(postId)) throw new Error("Invalid post ID");
    const detected = detectMedia(data);
    const limit = detected.mimeType.startsWith("image/")
      ? Number(process.env.MAX_IMAGE_BYTES ?? 25 * 1024 * 1024)
      : Number(process.env.MAX_VIDEO_BYTES ?? 250 * 1024 * 1024);
    if (data.length > limit) throw new Error(`File exceeds the ${Math.round(limit / 1024 / 1024)} MB limit`);
    const base = await this.safePath("assets");
    const directory = path.join(base, postId);
    await fs.mkdir(directory, { recursive: true });
    const stem = path.basename(fileName, path.extname(fileName)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "media";
    const storedName = `${stem}-${randomUUID().slice(0, 8)}.${detected.extension}`;
    const relativePath = `assets/${postId}/${storedName}`;
    await fs.writeFile(path.join(directory, storedName), data, { flag: "wx" });
    return { relativePath, fileName, mimeType: detected.mimeType, sizeBytes: data.length, contentHash: sha256(data) };
  }

  async removeMedia(relativePath: string): Promise<void> {
    if (!relativePath.startsWith("assets/")) throw new Error("Only managed assets can be removed");
    await fs.unlink(await this.safePath(relativePath));
  }

  async recordPublication(input: { id: string; title: string; platform: string; contentHash: string; publishedAt: string; liveUrl?: string }): Promise<string> {
    const month = input.publishedAt.slice(0, 7);
    const relative = `published/${month}.md`;
    const absolute = await this.safePath(relative, false);
    let raw = "";
    try { raw = await fs.readFile(absolute, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const entry = `\n## ${input.title}\n\n- Post ID: ${input.id}\n- Platform: ${input.platform}\n- Published at: ${input.publishedAt}\n- Live URL: ${input.liveUrl ?? ""}\n- Approved content hash: ${input.contentHash}\n`;
    const idPattern = new RegExp(`\\n## [^\\n]+\\n\\n- Post ID: ${input.id.replaceAll("-", "\\-")}\\n[\\s\\S]*?(?=\\n## |$)`);
    const heading = `# Publication ledger: ${month}\n`;
    const output = idPattern.test(raw) ? raw.replace(idPattern, entry) : `${raw || heading}${entry}`;
    await this.atomicWrite(absolute, output);
    return relative;
  }

  private async atomicWrite(absolute: string, content: string) {
    const temporary = `${absolute}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, content, "utf8");
    await fs.rename(temporary, absolute);
  }
}

export function getContentStore(): FilesystemContentStore {
  const root = process.env.SOCIAL_MEDIA_ROOT;
  if (!root) throw new Error("SOCIAL_MEDIA_ROOT is not configured");
  return new FilesystemContentStore(root);
}

function detectMedia(data: Buffer): { mimeType: string; extension: string } {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mimeType: "image/png", extension: "png" };
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { mimeType: "image/jpeg", extension: "jpg" };
  if (data.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/)) return { mimeType: "image/gif", extension: "gif" };
  if (data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return { mimeType: "image/webp", extension: "webp" };
  if (data.length >= 12 && data.subarray(4, 8).toString("ascii") === "ftyp") return { mimeType: "video/mp4", extension: "mp4" };
  throw new Error("Unsupported media. Use PNG, JPEG, GIF, WebP, or MP4.");
}
