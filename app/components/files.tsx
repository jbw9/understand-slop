"use client";

import { useEffect, useMemo, useState } from "react";
import { DIALOG, INPUT, Overlay, QUIET } from "@/components/dialog";
import { goTo } from "@/components/chrome";
import { useMap } from "@/components/map-context";
import { followTurn } from "@/components/workspace";
import { citations, required, symbolsOf, type Citation, type IndexFile, type MapIndex } from "@/lib/coverage";
import { cn } from "@/lib/utils";

/**
 * Every file of the checkout, and where the map explains each part of it.
 *
 * The map is cut by what people do (D16), which is the right way down for a
 * reader who knows what they are looking for by name — and no way at all for
 * one holding a path from a stack trace or a function from a review. This is
 * the other way in: the repository's own files, each saying how much of it the
 * map explains, why it was left out, or that it arrived after the map was
 * made, and each top-level symbol a click from the level that explains it.
 * Nothing in the checkout is absent from this list, so "where is this part?"
 * always has an answer, even when the answer is "nowhere yet".
 *
 * The panel routes, the level shows (D58): a pick opens that level and closes
 * the panel.
 */

const OPEN = "slop:files";

export type FilesFilter = "all" | "gaps" | "excluded" | "added";
export const openFiles = (filter: FilesFilter = "all") => window.dispatchEvent(new CustomEvent<FilesFilter>(OPEN, { detail: filter }));

interface Files {
  index: MapIndex | null;
  /** New files of a kind the map explains. */
  added: string[];
}

const fetched = new Map<string, Files>();

/** The open map's file index (app/api/files), fetched again whenever the map is rewritten. Null until it arrives, or on a map with no checkout. */
export function useFiles(): Files | null {
  const map = useMap();
  // Tagged with its map, so a switch never shows the last map's files while (or if) the new one's fail to load.
  const [got, setFiles] = useState<{ name: string; files: Files } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/files?map=${encodeURIComponent(map.name)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((r: Files | null) => {
        if (!live || !r) return;
        fetched.set(map.name, r);
        setFiles({ name: map.name, files: r });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [map.name, map.RUN]);
  return got?.name === map.name ? got.files : (fetched.get(map.name) ?? null);
}

/** Every span the reader can open on the open map, by file. */
export function useCitations() {
  const { L0 } = useMap();
  return useMemo(() => citations(L0), [L0]);
}

/** The trail to a level in the titles the reader sees. */
export function useTrail() {
  const { nodeAt } = useMap();
  return (path: string[]) => path.map((_, i) => nodeAt(path.slice(0, i + 1))?.title ?? path[i]).join(" › ");
}

type Row = { path: string; file?: IndexFile; added?: boolean };

export function FilesPanel() {
  const map = useMap();
  const files = useFiles();
  const cited = useCitations();
  const trail = useTrail();
  const [filter, setFilter] = useState<FilesFilter | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [asked, setAsked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const on = (e: Event) => setFilter((e as CustomEvent<FilesFilter>).detail ?? "all");
    window.addEventListener(OPEN, on);
    return () => window.removeEventListener(OPEN, on);
  }, []);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = Object.entries(files?.index?.files ?? {}).map(([path, file]) => ({ path, file }));
    for (const path of files?.added ?? []) out.push({ path, added: true });
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }, [files]);

  const gapsOf = (r: Row) => (r.file?.status === "source" ? symbolsOf(cited, r.path, r.file).filter((s) => required(s) && !s.by.length) : []);
  const counts = useMemo(
    () => ({
      all: rows.length,
      gaps: rows.filter((r) => gapsOf(r).length).length,
      excluded: rows.filter((r) => r.file?.status === "excluded").length,
      added: rows.filter((r) => r.added).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gapsOf reads only rows and cited
    [rows, cited],
  );

  if (!filter) return null;
  const close = () => setFilter(null);
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (filter === "gaps" && !gapsOf(r).length) return false;
    if (filter === "excluded" && r.file?.status !== "excluded") return false;
    if (filter === "added" && !r.added) return false;
    return !q || r.path.toLowerCase().includes(q) || r.file?.symbols.some((s) => s.name.toLowerCase().includes(q));
  });

  /** Ask the updater to explain what no level opens yet, or to take in new files. */
  const ask = (r: Row) => {
    const root = map.RUN.root;
    if (!root) return;
    const gaps = gapsOf(r);
    // The section nearest the file already, else the root that owns it: where the updater starts.
    const near = (cited.get(r.path) ?? [])[0]?.path.at(-1) ?? r.file?.roots[0];
    void followTurn(root, {
      transcript: null,
      corrections:
        gaps.length && near
          ? [{ section: near, note: `Explain ${gaps.map((s) => `\`${s.name}\` (${r.path}:${s.start}-${s.end})`).join(", ")}: no leaf or step opens them yet. Give each a leaf, or a step that cites it.` }]
          : [],
    });
    setAsked(new Set(asked).add(r.path));
  };

  return (
    <Overlay onClose={close}>
      <div className={DIALOG + " max-w-[760px]"}>
        <header className="shrink-0 border-b border-border-gray px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink">Every file</h2>
          <p className="mt-0.5 text-[12px] text-muted-slate">Where each part of the code is explained. Pick a symbol to open the level that explains it.</p>
          {files && !files.index ? (
            <p className="mt-2 text-[12px] text-amber-ink">This map was made before maps kept a file index; regenerate it to see every file here.</p>
          ) : null}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {(
              [
                ["all", "All"],
                ["gaps", "Not fully explained"],
                ["excluded", "Left out"],
                ["added", "Not on the map yet"],
              ] as const
            ).map(([k, label]) =>
              k === "all" || counts[k] ? (
                <button
                  key={k}
                  type="button"
                  aria-pressed={filter === k}
                  onClick={() => setFilter(k)}
                  className={cn(
                    "cursor-pointer rounded-[2px] border px-2 py-0.5 text-[12px]",
                    filter === k ? "border-deep-green text-deep-green" : "border-border-gray text-muted-slate hover:text-ink",
                  )}
                >
                  {label} <span className="font-mono text-[11px]">{counts[k]}</span>
                </button>
              ) : null,
            )}
            <span className="flex-1" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by path or symbol" aria-label="Filter files" className={INPUT + " w-[220px] py-1 text-[12px]"} />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          {!files ? <p className="text-[13px] text-muted-slate">Reading the checkout…</p> : null}
          {files && !shown.length ? <p className="text-[13px] text-muted-slate">Nothing matches.</p> : null}
          <ul className="flex flex-col">
            {shown.map((r) => (
              <li key={r.path} className="border-b border-border-gray last:border-0">
                <FileRow
                  row={r}
                  cited={cited.get(r.path) ?? []}
                  gaps={gapsOf(r).length}
                  open={open === r.path || (Boolean(q) && shown.length <= 5)}
                  onToggle={() => setOpen(open === r.path ? null : r.path)}
                  onGo={(path) => (goTo(path), close())}
                  trail={trail}
                  asked={asked.has(r.path)}
                  onAsk={map.RUN.root ? () => ask(r) : undefined}
                />
              </li>
            ))}
          </ul>
        </div>
        <footer className="flex shrink-0 justify-end border-t border-border-gray px-5 py-2.5">
          <button type="button" onClick={close} className={QUIET}>
            Close
          </button>
        </footer>
      </div>
    </Overlay>
  );
}

function FileRow({
  row,
  cited,
  gaps,
  open,
  onToggle,
  onGo,
  trail,
  asked,
  onAsk,
}: {
  row: Row;
  cited: Citation[];
  gaps: number;
  open: boolean;
  onToggle: () => void;
  onGo: (path: string[]) => void;
  trail: (path: string[]) => string;
  asked: boolean;
  onAsk?: () => void;
}) {
  const f = row.file;
  const syms = f ? symbolsOf(new Map([[row.path, cited]]), row.path, f) : [];
  const need = syms.filter(required).length;
  // Levels citing the file, each once, deepest first: the way in for a file with no symbols to pick.
  const levels = [...new Map(cited.map((c) => [c.path.join("/"), c.path])).values()].sort((a, b) => b.length - a.length);
  const badge = row.added
    ? { text: "not on the map yet", tone: "text-amber-ink" }
    : f?.status === "excluded"
      ? { text: "left out", tone: "text-faint" }
      : f?.status === "other"
        ? { text: f.kind ?? "other", tone: "text-faint" }
        : need
          ? { text: `${need - gaps}/${need} explained`, tone: gaps ? "text-amber-ink" : "text-deep-green" }
          : { text: levels.length ? "explained" : "not explained", tone: levels.length ? "text-deep-green" : "text-amber-ink" };
  return (
    <div className="py-1.5">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full cursor-pointer items-baseline gap-3 text-left">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{row.path}</span>
        <span className={cn("shrink-0 text-[11.5px]", badge.tone)}>{badge.text}</span>
      </button>
      {f?.purpose && !open ? <p className="truncate text-[11.5px] text-muted-slate">{f.purpose}</p> : null}
      {open ? (
        <div className="mt-1 flex flex-col gap-1 pb-1 pl-3">
          {f?.purpose ? <p className="text-[12px] leading-snug text-muted-slate">{f.purpose}</p> : null}
          {f?.reason ? <p className="text-[12px] text-muted-slate">Left out: {f.reason}</p> : null}
          {row.added ? <p className="text-[12px] text-muted-slate">Added since the map was made; the next update takes it in.</p> : null}
          {syms.map((s) => (
            <div key={`${s.name}:${s.start}`} className="flex items-baseline gap-2 text-[12px]">
              <span className="shrink-0 font-mono text-ink">{s.name}</span>
              <span className="shrink-0 font-mono text-[10.5px] text-faint">
                {s.start}–{s.end}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-slate">{s.does}</span>
              {s.by.length ? (
                <button type="button" onClick={() => onGo(s.by[0].path)} className="max-w-[45%] shrink-0 cursor-pointer truncate text-deep-green hover:underline">
                  {trail(s.by[0].path)}
                </button>
              ) : (
                <span className={cn("shrink-0", required(s) ? "text-amber-ink" : "text-faint")}>not explained</span>
              )}
            </div>
          ))}
          {!syms.length && levels.length ? (
            <div className="flex flex-col gap-0.5 text-[12px]">
              <span className="text-faint">Explained in</span>
              {levels.slice(0, 6).map((p) => (
                <button key={p.join("/")} type="button" onClick={() => onGo(p)} className="cursor-pointer truncate text-left text-deep-green hover:underline">
                  {trail(p)}
                </button>
              ))}
            </div>
          ) : null}
          {onAsk && (gaps || row.added) ? (
            <button type="button" disabled={asked} onClick={onAsk} className={QUIET + " mt-1 self-start"}>
              {asked ? "Asked — the map is updating" : row.added ? "Update the map" : "Explain these on the map"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
