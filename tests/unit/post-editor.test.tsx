// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PostEditor } from "@/components/posts/post-editor";

describe("PostEditor", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("copies the textarea's current value", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<PostEditor post={{ content: "Original copy" }} action={() => undefined} isNew />);

    const textarea = screen.getByLabelText("Exact public copy");
    fireEvent.change(textarea, { target: { value: "Updated unsaved copy" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy exact public copy" }));

    expect(writeText).toHaveBeenCalledWith("Updated unsaved copy");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Added to clipboard");
  });

  it("falls back to selection-based copying when the Clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    render(<PostEditor post={{ content: "Mobile copy" }} action={() => undefined} isNew />);

    fireEvent.click(screen.getByRole("button", { name: "Copy exact public copy" }));

    await waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("falls back when the Clipboard API rejects the write", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Not allowed"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    render(<PostEditor post={{ content: "Fallback copy" }} action={() => undefined} isNew />);

    fireEvent.click(screen.getByRole("button", { name: "Copy exact public copy" }));

    await waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });
});
