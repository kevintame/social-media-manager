// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PostEditor } from "@/components/posts/post-editor";

describe("PostEditor", () => {
  it("copies the textarea's current value", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<PostEditor post={{ content: "Original copy" }} action={() => undefined} isNew />);

    const textarea = screen.getByLabelText("Exact public copy");
    fireEvent.change(textarea, { target: { value: "Updated unsaved copy" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy exact public copy" }));

    expect(writeText).toHaveBeenCalledWith("Updated unsaved copy");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });
});
