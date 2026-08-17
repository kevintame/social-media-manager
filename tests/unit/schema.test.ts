import { describe, expect, it } from "vitest";
import { createPostSchema } from "@/features/posts/schema";

describe("post validation", () => {
  it("accepts a valid LinkedIn draft", () => {
    expect(createPostSchema.safeParse({ title: "A post", content: "Exact copy", platform: "linkedin", status: "draft", postType: "original", sourceUrl: "", targetDate: "", liveUrl: "" }).success).toBe(true);
  });

  it("rejects invalid URLs and empty titles", () => {
    expect(createPostSchema.safeParse({ title: "", content: "", platform: "linkedin", status: "draft", postType: "original", sourceUrl: "nope" }).success).toBe(false);
  });

  it("does not allow creating an already approved or posted record", () => {
    const base = { title: "A post", content: "Exact copy", platform: "linkedin", postType: "original" };
    expect(createPostSchema.safeParse({ ...base, status: "approved" }).success).toBe(false);
    expect(createPostSchema.safeParse({ ...base, status: "posted" }).success).toBe(false);
  });
});
