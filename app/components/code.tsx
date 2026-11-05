"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/button";
import { CodeEditor } from "@/components/editor";
import { useMap } from "@/components/map-context";
import { Eyebrow } from "@/components/state";
import type { Slice, WriteResult } from "@/lib/repo";
import { readSource, SOURCE_URL } from "@/lib/source";
import { openTab } from "@/lib/tabs";

/**
 * A whole file, to read and edit as in an editor (D74). It takes the level's
 * place while `?file=` is in the URL, as a doc does (D66), and usually opens
 * in a tab of its own beside the level it came from — "Open the whole file"
 * on any code — so Back, Escape and closing the tab all return there.
 *
 * Text comes through `/api/source` and goes back through it, behind the same
 * containment and stale-read check as the code pane: a file that changed on
 * disk since it was opened is refused, never overwritten.
 */

const urlOf = (path: string[], file: string, line?: number) => {
  const q = new URLSearchParams();
  const now = new URLSearchParams(window.location.search);
  const map = now.get("map");
  if (map) q.set("map", map);
  for (const id of path) q.append("at", id);
  q.set("file", file);
  if (line) q.set("line", String(line));
  return `?${q}`;
};

/** Opens a file over the level at `path`. */
export function openFile(path: string[], file: string, line?: number) {
  window.history.pushState(null, "", urlOf(path, file, line));
}

/** Opens a file in a new tab beside the one in front, over the level at `path`. */
export function openFileInTab(map: string, path: string[], file: string, line?: number) {
  openTab(map, path, file);
  openFile(path, file, line);
}

export function closeFile() {
  const q = new URLSearchParams(window.location.search);
  q.delete("file");
  q.delete("line");
  window.history.pushState(null, "", q.size ? `?${q}` : window.location.pathname);
}

/** The file open in the URL, if any. */
export function useOpenFile(): { file: string; line?: number } | null {
  const params = useSearchParams();
  const file = params.get("file");
  return file ? { file, line: Number(params.get("line")) || undefined } : null;
}

export function FileView({ file, line }: { file: string; line?: number }) {
  const { name: map } = useMap();
  const [slice, setSlice] = useState<Slice | null | "failed">(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState<WriteResult | null>(null);

  const read = useCallback(
    (signal?: AbortSignal) =>
      readSource({ map, file, start: 1, end: Number.MAX_SAFE_INTEGER }, signal)
        .then((r) => ("slice" in r ? r.slice : ("failed" as const)))
        .catch(() => "failed" as const),
    [map, file],
  );
  useEffect(() => {
    const ac = new AbortController();
    void read(ac.signal).then((s) => !ac.signal.aborted && setSlice(s));
    return () => ac.abort();
  }, [read]);

  const text = slice && slice !== "failed" ? slice.code : "";
  const dirty = draft !== null && draft !== text;

  async function save() {
    if (!dirty || !slice || slice === "failed") return;
    const res = await fetch("/api/source", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // writeSlice drops one trailing newline from what it is sent; a whole
      // file may end in one of its own, so give it one to drop.
      body: JSON.stringify({ map, file, start: 1, end: slice.total, code: `${draft}\n`, expected: text }),
    });
    const body = (await res.json()) as WriteResult;
    setSaved(body);
    if (body.ok) {
      // What is on disk now is the only thing this view may show as the file.
      setSlice(await read());
      setDraft(null);
    }
  }

  return (
    <>
      <header className="mb-5 border-b border-border-gray pb-5">
        <div className="mb-4">
          <Button onClick={closeFile}>‹ Back to the map</Button>
        </div>
        <Eyebrow>Code</Eyebrow>
        <h1 className="mt-2 break-all font-mono text-[20px] font-semibold tracking-[-0.01em] text-ink">{file}</h1>
        {slice && slice !== "failed" ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="tnum font-mono text-[11px] text-faint">{slice.total.toLocaleString()} lines</span>
            {SOURCE_URL ? null : dirty ? (
              <>
                <Button variant="primary" onClick={() => void save()}>
                  Save to disk
                </Button>
                <Button variant="ghost" onClick={() => (setDraft(null), setSaved(null))}>
                  Discard changes
                </Button>
                <span className="text-[12px] text-muted-slate">⌘S saves. Nothing is written until you do.</span>
              </>
            ) : (
              <span className="text-[12px] text-muted-slate">Type to edit; ⌘S saves to disk.</span>
            )}
            {saved?.ok && !dirty ? <span className="text-[12px] text-accent">Saved.</span> : null}
            {saved && !saved.ok ? (
              <span className="text-[12px] text-clay-ink">
                Not saved: {saved.refused}
                {saved.refused === "stale" ? " — the file changed on disk since it was opened. Discard and reopen to get the current text." : ""}
              </span>
            ) : null}
          </div>
        ) : null}
      </header>
      {slice === null ? <p className="text-[13px] text-faint">Reading…</p> : null}
      {slice === "failed" ? <p className="text-[13px] text-clay-ink">Could not read this file from the repository.</p> : null}
      {slice && slice !== "failed" ? (
        <div className="overflow-hidden border border-border-gray">
          <CodeEditor
            file={file}
            start={1}
            value={draft ?? text}
            onChange={setDraft}
            onSave={() => void save()}
            readOnly={Boolean(SOURCE_URL)}
            lit={line}
            className="max-h-[calc(100vh-260px)]"
          />
        </div>
      ) : null}
    </>
  );
}
