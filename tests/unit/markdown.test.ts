import { describe, expect, it } from "vitest";
import { assignIds, invalidateChangedApprovals, parseMarkdown, patchMarkdownPost, publicContentHash } from "@/lib/content-store/markdown";

const stat = { size: 100, mtime: new Date("2026-08-16T12:00:00Z") };

const daily = `---
date: "2026-08-16"
platform: LinkedIn
status: ready-for-Kevin-review
---
# Daily posts

Intro that must be preserved.

## Post 1: Trust before speed

**Recommended time:** 12:15 PM MDT
**Status:** Ready for Kevin review
**Type:** Original

### Exact copy

\`\`\`text
First exact copy.
\`\`\`

### Scheduling notes

- Preserve this note.

## Post 2: A second post

**Status:** Draft
**Type:** Original

### Exact copy

\`\`\`text
Second exact copy.
\`\`\`
`;

describe("Markdown post parsing", () => {
  it("parses daily bundle sections as separate posts", () => {
    const document = parseMarkdown("drafts/daily/2026-08-16-linkedin-posts.md", daily, stat);
    expect(document.kind).toBe("daily_bundle");
    expect(document.posts).toHaveLength(2);
    expect(document.posts[0]).toMatchObject({ title: "Trust before speed", content: "First exact copy.", status: "ready_for_review" });
  });

  it("keeps daily templates in the reference library", () => {
    const document = parseMarkdown("templates/daily-linkedin-posts.md", daily, stat);
    expect(document.kind).toBe("template");
    expect(document.posts).toHaveLength(0);
  });

  it("assigns stable IDs without changing prose", () => {
    const document = parseMarkdown("drafts/daily/day.md", daily, stat);
    const assigned = assignIds(daily, document);
    expect(assigned.assigned).toBe(2);
    expect(assigned.raw.match(/social-post-id/g)).toHaveLength(2);
    expect(assigned.raw).toContain("Intro that must be preserved.");
    expect(assigned.raw).toContain("- Preserve this note.");
    const reparsed = parseMarkdown("drafts/daily/day.md", assigned.raw, stat);
    expect(reparsed.posts.every((post) => Boolean(post.id))).toBe(true);
    expect(reparsed.posts.map((post) => post.content)).toEqual(["First exact copy.", "Second exact copy."]);
  });

  it("patches only the selected section's owned fields", () => {
    const withIds = assignIds(daily, parseMarkdown("drafts/daily/day.md", daily, stat)).raw;
    const post = parseMarkdown("drafts/daily/day.md", withIds, stat).posts[0];
    const output = patchMarkdownPost(withIds, { ...post, id: post.id!, locator: post.locator, title: "Updated title", content: "Updated exact copy.", status: "needs_changes", platform: "linkedin", postType: "original" });
    expect(output).toContain("## Post 1: Updated title");
    expect(output).toContain("Updated exact copy.");
    expect(output).toContain("Second exact copy.");
    expect(output).toContain("- Preserve this note.");
  });

  it("writes replacement-token characters literally", () => {
    const withIds = assignIds(daily, parseMarkdown("drafts/daily/day.md", daily, stat)).raw;
    const post = parseMarkdown("drafts/daily/day.md", withIds, stat).posts[0];
    const literal = "$& $1 $2 $` $'";
    const output = patchMarkdownPost(withIds, { ...post, id: post.id!, locator: post.locator, title: literal, content: literal, status: "draft", platform: "linkedin", postType: literal });
    const reparsed = parseMarkdown("drafts/daily/day.md", output, stat).posts[0];
    expect(reparsed.title).toBe(literal);
    expect(reparsed.content).toBe(literal);
    expect(reparsed.postType).toBe(literal);
    expect(output).toContain("Second exact copy.");
  });

  it("invalidates approval after exact copy changes", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const base = `---\npost_id: ${id}\nstatus: approved\nplatform: linkedin\npost_type: original\napproved_by: ${id}\napproved_at: 2026-08-16T12:00:00Z\napproved_content_hash: placeholder\n---\n# Title\n\n## Exact post text or reshare note\n\nChanged copy\n\n## Notes\n\nKeep me.\n`;
    const document = parseMarkdown("drafts/active/test.md", base, stat);
    expect(publicContentHash(document.posts[0])).not.toBe("placeholder");
    const result = invalidateChangedApprovals(base, document);
    expect(result.changed).toBe(true);
    const reparsed = parseMarkdown("drafts/active/test.md", result.raw, stat).posts[0];
    expect(reparsed.status).toBe("needs_changes");
    expect(reparsed.approvedAt).toBeUndefined();
    expect(result.raw).toContain("Keep me.");
  });
});

describe("Wrapper Markdown parsing", () => {
  it("pairs wrapper metadata with its media and extracts a scanning takeaway", () => {
    const raw = `---
type: wrapper
format: written content
source_creator: Example Creator
platform: LinkedIn
renamed_file: example-wrapper.jpg
sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
created: 2026-08-15
tags: [wrapper, analogy-hook]
---
# Example Wrapper

**Screenshot:** [[example-wrapper.jpg|Open screenshot]]

![[example-wrapper.jpg]]

## What was the structure

1. Make a comparison.

## What was the hook

> A visible hook.

## How do I reorient this for my unique problem + solution combo

Recommended rewritten hook:

> **A SHARPER REWRITTEN HOOK.**
`;
    const document = parseMarkdown("Wrappers/example-wrapper.md", raw, stat);
    expect(document.kind).toBe("wrapper");
    expect(document.wrapper).toMatchObject({
      slug: "example-wrapper",
      title: "Example Wrapper",
      format: "written content",
      sourceCreator: "Example Creator",
      platform: "LinkedIn",
      mediaPath: "Wrappers/example-wrapper.jpg",
      mediaHash: "a".repeat(64),
      tags: ["wrapper", "analogy-hook"],
      takeaway: "A SHARPER REWRITTEN HOOK.",
    });
    expect(document.wrapper?.analysisMarkdown).toContain("## What was the structure");
    expect(document.wrapper?.analysisMarkdown).not.toContain("Screenshot:");
    expect(document.wrapper?.analysisMarkdown).not.toContain("![[");
  });

  it("does not treat the wrapper index as an item", () => {
    const document = parseMarkdown("Wrappers/index.md", "# Wrapper Library\n", stat);
    expect(document.kind).toBe("wrapper");
    expect(document.wrapper).toBeUndefined();
  });
});
