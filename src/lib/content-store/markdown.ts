import { createHash, randomUUID } from "node:crypto";
import matter from "gray-matter";
import type { ParsedPost, VaultDocument } from "@/features/posts/types";
import { normalizeStatus } from "@/features/posts/status";

const UUID = "[0-9a-fA-F-]{36}";
const markerPattern = new RegExp(`<!--\\s*social-post-id:\\s*(${UUID})\\s*-->`);
const metaPattern = /<!--\s*social-post-meta:\s*(\{[^\n]*\})\s*-->/;

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function publicContentHash(post: Pick<ParsedPost, "content" | "platform" | "postType" | "sourceUrl" | "mediaPaths">): string {
  return sha256(JSON.stringify({
    content: post.content.trim(), platform: post.platform, postType: post.postType,
    sourceUrl: post.sourceUrl ?? "", mediaPaths: post.mediaPaths,
  }));
}

function field(section: string, name: string): string | undefined {
  const match = section.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*([^\\n]+)`, "i"));
  return match?.[1]?.trim().replace(/^None$/i, "");
}

function exactCopy(section: string): string {
  return section.match(/### Exact copy\s*\n+```(?:text)?\s*\n([\s\S]*?)\n```/i)?.[1]?.trim()
    ?? section.match(/## Exact post text or reshare note\s*\n+([\s\S]*?)(?=\n## |$)/i)?.[1]?.trim()
    ?? "";
}

function mediaPaths(text: string): string[] {
  const paths = new Set<string>();
  for (const match of text.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) paths.add(match[1]);
  for (const match of text.matchAll(/(?:Asset path:|renamed_file:)\s*["']?([^\n"']+)/gi)) {
    const value = match[1].trim();
    if (value && !/^none$/i.test(value)) paths.add(value);
  }
  for (const match of text.matchAll(/\*\*Media:\*\*\s*([^\n]+)/gi)) {
    const value = match[1].trim();
    if (value && !/^none$/i.test(value)) value.split(",").map((item) => item.trim()).filter(Boolean).forEach((item) => paths.add(item));
  }
  return [...paths];
}

export function classifyPath(relativePath: string, isDaily: boolean): VaultDocument["kind"] {
  if (isDaily) return "daily_bundle";
  const root = relativePath.split("/")[0]?.toLowerCase();
  if (root === "drafts") return "post";
  if (root === "published") return "published";
  if (root === "strategy") return "strategy";
  if (root === "ideas") return "idea";
  if (root === "templates") return "template";
  if (root === "wrappers") return "wrapper";
  if (root === "sources") return "source";
  return "other";
}

export function parseMarkdown(relativePath: string, raw: string, stat: { size: number; mtime: Date }): VaultDocument {
  const parsed = matter(raw);
  const heading = parsed.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const sections = relativePath.startsWith("drafts/daily/") ? [...raw.matchAll(/^## Post \d+:\s*(.+)$/gm)] : [];
  const posts: ParsedPost[] = [];

  if (sections.length) {
    sections.forEach((match, index) => {
      const start = match.index ?? 0;
      const end = sections[index + 1]?.index ?? raw.length;
      const section = raw.slice(start, end);
      let metadata: Record<string, string> = {};
      try { metadata = JSON.parse(section.match(metaPattern)?.[1] ?? "{}"); } catch { metadata = {}; }
      posts.push({
        id: section.match(markerPattern)?.[1],
        sourcePath: relativePath,
        locator: `section:${index + 1}`,
        title: match[1].trim(),
        platform: String(parsed.data.platform ?? "linkedin").toLowerCase() === "linkedin" ? "linkedin" : "other",
        status: normalizeStatus(metadata.status ?? field(section, "Status") ?? parsed.data.status),
        content: exactCopy(section),
        postType: field(section, "Type") ?? "original",
        sourceUrl: field(section, "Source post"),
        targetDate: parsed.data.date ? String(parsed.data.date) : undefined,
        recommendedTime: field(section, "Recommended time"),
        approvedBy: metadata.approved_by || undefined,
        approvedAt: metadata.approved_at || undefined,
        approvedContentHash: metadata.approved_content_hash || undefined,
        publishedAt: metadata.published_at || undefined,
        liveUrl: metadata.live_url || undefined,
        mediaPaths: mediaPaths(section),
      });
    });
  } else if ((relativePath.startsWith("drafts/") || relativePath.startsWith("published/")) && relativePath.endsWith(".md") && !relativePath.endsWith("README.md")) {
    posts.push({
      id: parsed.data.post_id || undefined,
      sourcePath: relativePath,
      locator: "document",
      title: heading ?? relativePath.split("/").at(-1)?.replace(/\.md$/, "") ?? "Untitled",
      platform: String(parsed.data.platform ?? "linkedin").toLowerCase() === "linkedin" ? "linkedin" : "other",
      status: normalizeStatus(parsed.data.status),
      content: exactCopy(raw),
      postType: String(parsed.data.post_type ?? "original"),
      sourceUrl: parsed.data.source_url || undefined,
      targetDate: parsed.data.planned_for || undefined,
      approvedBy: parsed.data.approved_by || undefined,
      approvedAt: parsed.data.approved_at || undefined,
      approvedContentHash: parsed.data.approved_content_hash || undefined,
      publishedAt: parsed.data.published_at || undefined,
      liveUrl: parsed.data.live_url || undefined,
      mediaPaths: mediaPaths(raw),
    });
  }

  return {
    relativePath,
    kind: classifyPath(relativePath, sections.length > 0),
    title: heading ?? relativePath.split("/").at(-1) ?? relativePath,
    excerpt: parsed.content.replace(/[#>*`|_-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 280),
    content: raw,
    hash: sha256(raw),
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    posts,
  };
}

export function assignIds(raw: string, document: VaultDocument): { raw: string; assigned: number } {
  let output = raw;
  let assigned = 0;
  const parsed = matter(output);
  const single = document.posts.length === 1 && document.posts[0].locator === "document";
  if (single && !document.posts[0].id) {
    parsed.data.post_id = randomUUID();
    output = matter.stringify(parsed.content, parsed.data);
    assigned++;
  } else {
    let offset = 0;
    for (const post of document.posts) {
      if (post.id) continue;
      const sectionNumber = Number(post.locator.split(":")[1]);
      const headings = [...output.matchAll(/^## Post \d+:.*$/gm)];
      const heading = headings[sectionNumber - 1];
      if (!heading?.index && heading?.index !== 0) continue;
      const insertAt = heading.index + heading[0].length + offset;
      const marker = `\n<!-- social-post-id: ${randomUUID()} -->`;
      output = output.slice(0, insertAt) + marker + output.slice(insertAt);
      offset += marker.length;
      assigned++;
    }
  }
  return { raw: output, assigned };
}

export function renderSinglePost(input: {
  id: string; title: string; content: string; status: string; platform: string; postType: string;
  sourceUrl?: string; targetDate?: string; approvedBy?: string; approvedAt?: string;
  approvedContentHash?: string; publishedAt?: string; liveUrl?: string;
  mediaPaths?: string[];
}): string {
  const data = {
    post_id: input.id, status: input.status, platform: input.platform, post_type: input.postType,
    source_url: input.sourceUrl ?? "", created: new Date().toISOString().slice(0, 10),
    planned_for: input.targetDate ?? "", approved_by: input.approvedBy ?? "",
    approved_at: input.approvedAt ?? "", approved_content_hash: input.approvedContentHash ?? "",
    published_at: input.publishedAt ?? "", live_url: input.liveUrl ?? "",
  };
  const assets = input.mediaPaths?.length ? input.mediaPaths.map((mediaPath) => `- Asset path: ${mediaPath}`).join("\n") : "- Asset path:";
  return matter.stringify(`\n# ${input.title}\n\n## Exact post text or reshare note\n\n${input.content.trim()}\n\n## Media preview\n\n${assets}\n- Ownership or permission:\n- Alt text:\n\n## Sources and factual support\n\n## Risks and required confirmations\n`, data);
}

export function patchMarkdownPost(raw: string, input: Parameters<typeof renderSinglePost>[0] & { locator: string }): string {
  if (input.locator === "document") {
    const parsed = matter(raw);
    Object.assign(parsed.data, {
      post_id: input.id, status: input.status, platform: input.platform, post_type: input.postType,
      source_url: input.sourceUrl ?? "", planned_for: input.targetDate ?? "",
      approved_by: input.approvedBy ?? "", approved_at: input.approvedAt ?? "",
      approved_content_hash: input.approvedContentHash ?? "", published_at: input.publishedAt ?? "",
      live_url: input.liveUrl ?? "",
    });
    let body = parsed.content.replace(/^#\s+.*$/m, `# ${input.title}`);
    const copyPattern = /(## Exact post text or reshare note\s*\n+)[\s\S]*?(?=\n## |$)/i;
    if (copyPattern.test(body)) body = body.replace(copyPattern, `$1${input.content.trim()}\n`);
    else body += `\n## Exact post text or reshare note\n\n${input.content.trim()}\n`;
    if (input.mediaPaths) {
      const mediaLines = input.mediaPaths.length ? input.mediaPaths.map((mediaPath) => `- Asset path: ${mediaPath}`).join("\n") : "- Asset path:";
      if (/- Asset path:[^\n]*(?:\n- Asset path:[^\n]*)*/i.test(body)) body = body.replace(/- Asset path:[^\n]*(?:\n- Asset path:[^\n]*)*/i, mediaLines);
    }
    return matter.stringify(body, parsed.data);
  }
  const sectionNumber = Number(input.locator.split(":")[1]);
  const headings = [...raw.matchAll(/^## Post \d+:.*$/gm)];
  const heading = headings[sectionNumber - 1];
  if (heading?.index === undefined) throw new Error("Post section no longer exists");
  const start = heading.index;
  const end = headings[sectionNumber]?.index ?? raw.length;
  let section = raw.slice(start, end);
  section = section.replace(/^## Post \d+:.*$/m, (value) => value.replace(/:\s*.*$/, `: ${input.title}`));
  if (!markerPattern.test(section)) section = section.replace(/^## Post \d+:.*$/m, (value) => `${value}\n<!-- social-post-id: ${input.id} -->`);
  const metadata = JSON.stringify({
    status: input.status,
    approved_by: input.approvedBy ?? "",
    approved_at: input.approvedAt ?? "",
    approved_content_hash: input.approvedContentHash ?? "",
    published_at: input.publishedAt ?? "",
    live_url: input.liveUrl ?? "",
  });
  if (metaPattern.test(section)) section = section.replace(metaPattern, `<!-- social-post-meta: ${metadata} -->`);
  else section = section.replace(markerPattern, (value) => `${value}\n<!-- social-post-meta: ${metadata} -->`);
  section = section.replace(/(\*\*Status:\*\*\s*)[^\n]+/i, `$1${input.status.replaceAll("_", " ")}`);
  if (input.mediaPaths) {
    const media = input.mediaPaths.length ? input.mediaPaths.join(", ") : "None";
    if (/\*\*Media:\*\*\s*[^\n]*/i.test(section)) section = section.replace(/(\*\*Media:\*\*\s*)[^\n]*/i, `$1${media}`);
    else section = section.replace(/(\*\*Type:\*\*[^\n]*\n)/i, `$1**Media:** ${media}\n`);
  }
  if (/### Exact copy\s*\n+```(?:text)?\s*\n[\s\S]*?\n```/i.test(section)) {
    section = section.replace(/(### Exact copy\s*\n+```(?:text)?\s*\n)[\s\S]*?(\n```)/i, `$1${input.content.trim()}$2`);
  } else {
    section += `\n### Exact copy\n\n\`\`\`text\n${input.content.trim()}\n\`\`\`\n`;
  }
  return raw.slice(0, start) + section + raw.slice(end);
}

export function invalidateChangedApprovals(raw: string, document: VaultDocument): { raw: string; changed: boolean } {
  let output = raw;
  let changed = false;
  for (const post of document.posts) {
    if (!post.id || !post.approvedContentHash || post.approvedContentHash === publicContentHash(post)) continue;
    if (post.locator === "document") {
      const parsed = matter(output);
      parsed.data.status = "needs_changes";
      parsed.data.approved_by = "";
      parsed.data.approved_at = "";
      parsed.data.approved_content_hash = "";
      output = matter.stringify(parsed.content, parsed.data);
    } else {
      output = patchMarkdownPost(output, {
        ...post,
        id: post.id,
        locator: post.locator,
        status: "needs_changes",
        approvedBy: undefined,
        approvedAt: undefined,
        approvedContentHash: undefined,
      });
    }
    changed = true;
  }
  return { raw: output, changed };
}
