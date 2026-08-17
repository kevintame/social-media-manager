"use client";

import { useRef, useState } from "react";
import type { PostStatus } from "@/features/posts/types";

type EditablePost = { id?: string; source_hash?: string; title?: string; content?: string; platform?: string; status?: PostStatus; post_type?: string; source_url?: string | null; target_date?: string | null; live_url?: string | null };

export function PostEditor({ post, action, isNew = false }: { post: EditablePost; action: (form: FormData) => void | Promise<void>; isNew?: boolean }) {
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [copyLabel, setCopyLabel] = useState("Copy");

  function copyWithSelection(textarea: HTMLTextAreaElement) {
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const wasFocused = document.activeElement === textarea;

    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.setSelectionRange(selectionStart, selectionEnd);
    if (!wasFocused) textarea.blur();
    return copied;
  }

  async function copyPublicContent() {
    const textarea = contentRef.current;
    if (!textarea) return;

    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(textarea.value);
        } catch {
          if (!copyWithSelection(textarea)) throw new Error("Copy failed");
        }
      } else if (!copyWithSelection(textarea)) {
        throw new Error("Copy failed");
      }
      setCopyLabel("Copied");
      window.setTimeout(() => setCopyLabel("Copy"), 2000);
    } catch {
      setCopyLabel("Copy failed");
      window.setTimeout(() => setCopyLabel("Copy"), 2000);
    }
  }

  return <form action={action} className="panel form-grid">
    {copyLabel === "Copied" && (
      <div
        className="clipboard-toast"
        role="status"
        aria-live="polite"
        style={{
          position: "fixed",
          zIndex: 1000,
          left: "50%",
          bottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))",
          display: "flex",
          alignItems: "center",
          gap: ".55rem",
          width: "max-content",
          maxWidth: "calc(100vw - 2rem)",
          padding: ".8rem 1rem",
          borderRadius: ".7rem",
          background: "#203a2d",
          color: "white",
          boxShadow: "0 8px 28px rgb(32 35 31 / 25%)",
          fontSize: ".9rem",
          fontWeight: 700,
          transform: "translateX(-50%)",
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" style={{ flex: "0 0 18px", fill: "none", stroke: "currentColor", strokeWidth: 2.25, strokeLinecap: "round", strokeLinejoin: "round" }}><path d="m5 12 4 4L19 6" /></svg>
        Added to clipboard
      </div>
    )}
    {!isNew && <><input type="hidden" name="id" value={post.id} /><input type="hidden" name="expectedSourceHash" value={post.source_hash} /></>}
    <label className="full">Internal title<input name="title" required maxLength={200} defaultValue={post.title} /></label>
    <label>Platform<select name="platform" defaultValue={post.platform ?? "linkedin"}><option value="linkedin">LinkedIn</option><option value="other">Other</option></select></label>
    <label>Post type<input name="postType" defaultValue={post.post_type ?? "original"} required /></label>
    <label>Status<select name="status" defaultValue={post.status ?? "draft"}><option value="draft">Draft</option><option value="needs_changes">Needs changes</option><option value="ready_for_review">Ready for Kevin review</option>{!isNew && <><option value="approved">Approved (Kevin only)</option><option value="posted">Posted</option></>}</select></label>
    <label>Target date<input name="targetDate" type="date" defaultValue={post.target_date ?? ""} /></label>
    <label className="full">Source URL<input name="sourceUrl" type="url" defaultValue={post.source_url ?? ""} /></label>
    <div className="full copy-field">
      <label htmlFor="public-copy">Exact public copy</label>
      <div className="textarea-with-action">
        <textarea ref={contentRef} id="public-copy" name="content" defaultValue={post.content} maxLength={30000} />
        <button
          className="secondary copy-button"
          type="button"
          onClick={copyPublicContent}
          aria-label={copyLabel === "Copy" ? "Copy exact public copy" : copyLabel}
          title={copyLabel === "Copy" ? "Copy exact public copy" : copyLabel}
        >
          {copyLabel === "Copied" ? (
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
          )}
        </button>
      </div>
    </div>
    <label className="full">Live post URL<input name="liveUrl" type="url" defaultValue={post.live_url ?? ""} /></label>
    <div className="actions full"><button type="submit">{isNew ? "Create draft" : "Save changes"}</button>{!isNew && <span className="muted">Saving checks the source file for outside changes.</span>}</div>
  </form>;
}
