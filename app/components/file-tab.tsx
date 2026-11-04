"use client";

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { CodeEditor } from "@/components/editor";
import { langOf } from "@/lib/highlight";
import { cn } from "@/lib/utils";

/**
 * A file a terminal named (components/shell.tsx), open in the main view as an
 * editor tab: a breadcrumb over the path, the code pane's editor with its
 * gutter, and a status line. Any file on disk, read and written through the
 * desktop app (src-tauri/src/files.rs) rather than the map's `/api/source`,
 * since agents name files outside the project and Claude's pasted images.
 */

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i;
/** Past this the editor's one-div-per-line drawing gets slow; such a file is named, not drawn. */
const TOO_BIG = 2_000_000;

type Read =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string; bytes: number }
  | { kind: "other"; why: string };

const LANG: Record<string, string> = { c: "Code", python: "Python", sql: "SQL", markup: "Markup", plain: "Plain text" };

export function FileTab({ path, line, visible, inset }: { path: string; line?: number; visible: boolean; inset?: string }) {
  const [read, setRead] = useState<Read | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState<"saved" | string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const load = () =>
    invoke<ArrayBuffer>("file_read", { path }).then((buf): Read => {
      if (IMAGE.test(path)) {
        const type = path.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "";
        return { kind: "image", url: URL.createObjectURL(new Blob([buf], type ? { type } : {})), bytes: buf.byteLength };
      }
      if (buf.byteLength > TOO_BIG) return { kind: "other", why: `Too large to open here (${(buf.byteLength / 1e6).toFixed(1)} MB).` };
      try {
        return { kind: "text", text: new TextDecoder("utf-8", { fatal: true }).decode(buf) };
      } catch {
        return { kind: "other", why: "A binary file: nothing here to read as text." };
      }
    });

  useEffect(() => {
    let gone = false;
    let url: string | undefined;
    load()
      .catch((e): Read => ({ kind: "other", why: `Could not read it: ${String(e)}` }))
      .then((r) => {
        if (r.kind === "image") url = r.url;
        if (gone) return;
        setRead(r);
        setDraft(null);
      });
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const text = read?.kind === "text" ? read.text : "";
  const dirty = draft !== null && draft !== text;

  async function save() {
    if (!dirty || read?.kind !== "text") return;
    try {
      await invoke("file_write", { path, text: draft, expected: text });
      setRead({ kind: "text", text: draft! });
      setDraft(null);
      setSaved("saved");
    } catch (e) {
      setSaved(String(e) === "stale" ? "it changed on disk since it was opened. Reopen it to get the current text." : String(e));
    }
  }

  const home = path.match(/^\/Users\/[^/]+|^\/home\/[^/]+/)?.[0];
  const crumbs = (home ? `~${path.slice(home.length)}` : path).split("/").filter(Boolean);
  const name = crumbs.at(-1) ?? path;

  return (
    <div data-chrome className={cn("absolute inset-0 flex flex-col bg-code", !visible && "hidden")} style={{ paddingRight: inset }}>
      <div className="flex h-7 shrink-0 items-center gap-1 overflow-x-auto border-b border-border-gray px-4 font-mono text-[11.5px] text-faint" title={path}>
        {crumbs.map((c, i) => (
          <span key={i} className="flex shrink-0 items-center gap-1">
            {i > 0 ? <span aria-hidden>›</span> : null}
            <span className={cn(i === crumbs.length - 1 && "text-ink")}>{c}</span>
          </span>
        ))}
        {dirty ? <span aria-label="Unsaved changes" className="ml-1.5 size-2 shrink-0 rounded-full bg-ink" /> : null}
      </div>

      <div className="relative min-h-0 flex-1">
        {read === null ? <p className="p-4 text-[12.5px] text-faint">Reading…</p> : null}
        {read?.kind === "other" ? <p className="p-4 text-[12.5px] text-muted-slate">{read.why}</p> : null}
        {read?.kind === "image" ? (
          <div className="absolute inset-0 flex items-center justify-center overflow-auto p-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local blob, not a page asset */}
            <img
              src={read.url}
              alt={name}
              onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="max-h-full max-w-full object-contain shadow-[0_0_0_1px_var(--color-border-gray)]"
            />
          </div>
        ) : null}
        {read?.kind === "text" ? (
          <CodeEditor
            key={path}
            file={path}
            start={1}
            value={draft ?? text}
            onChange={(next) => (setDraft(next), setSaved(null))}
            onSave={() => void save()}
            lit={line}
            className="absolute inset-0"
          />
        ) : null}
      </div>

      <div className="flex h-6 shrink-0 items-center gap-4 border-t border-border-gray px-4 font-mono text-[11px] text-faint">
        {read?.kind === "text" ? (
          <>
            {line ? <span>Ln {line}</span> : null}
            <span className="tnum">{(draft ?? text).split("\n").length.toLocaleString()} lines</span>
            <span>{LANG[langOf(path)]}</span>
            <span>UTF-8</span>
            <span className="ml-auto">
              {saved && saved !== "saved" ? (
                <span className="text-clay-ink">Not saved: {saved}</span>
              ) : dirty ? (
                "⌘S to save"
              ) : saved === "saved" ? (
                "Saved"
              ) : null}
            </span>
          </>
        ) : read?.kind === "image" ? (
          <>
            {size ? <span className="tnum">{size.w} × {size.h}</span> : null}
            <span className="tnum">{(read.bytes / 1024).toFixed(0)} KB</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
