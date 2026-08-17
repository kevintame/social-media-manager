import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const managerSources = [
  "src/features/manager/core.ts",
  "src/features/manager/repository.ts",
  "src/app/api/manager/route.ts",
];
const protectedTables = ["posts", "documents", "post_media", "sync_state", "publications"];

describe("manager projection boundary", () => {
  it("does not mutate protected projection tables outside centralized sync", async () => {
    for (const relativePath of managerSources) {
      const source = await readFile(path.join(process.cwd(), relativePath), "utf8");
      for (const table of protectedTables) {
        const directMutation = new RegExp(
          `\\.from\\(["']${table}["']\\)[^;]*\\.(?:insert|upsert|update|delete)\\(`,
          "s",
        );
        expect(source, `${relativePath} must not mutate protected table ${table}`).not.toMatch(directMutation);
      }
    }
  });
});
