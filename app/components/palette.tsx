"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { goTo, useLocation } from "@/components/chrome";
import { useMap } from "@/components/map-context";
import { Kbd } from "@/components/button";
import { StateChip } from "@/components/state";
import { openProjects } from "@/components/projects";
import { openAudit } from "@/components/audit";
import { openHistory } from "@/components/history";
import { openDiff } from "@/components/diff";
import { toggleWorkspace } from "@/components/workspace";
import { DocIcon, openDoc, useDocList } from "@/components/docs";
import { openSettings, readSettings, saveSettings } from "@/lib/settings";
import type { Node } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * The palette: one box that goes anywhere. Type part of a level's name and
 * Enter opens it however deep it is, and a doc of the project's opens the
 * same way; start with `>` for the app's actions;
 * the map name in the title bar opens it on the maps, and the status bar's
 * counts open it on the levels that are not certain or the problems found.
 *
 * It is what a sidebar tree would have been for — reaching a level without
 * walking down to it — without spending a column on it (D35, D62).
 */

const OPEN = "slop:palette";
export type PaletteMode = "all" | "actions" | "maps" | "unsure" | "problems" | "docs";
export const openPalette = (mode: PaletteMode = "all") =>
  window.dispatchEvent(new CustomEvent<PaletteMode>(OPEN, { detail: mode }));

interface Item {
  key: string;
  label: string;
  /** Where it is or what it does, after the label. */
  hint?: string;
  /** A second line: why a level is not certain, or what goes wrong. */
  detail?: string;
  kind: "level" | "action" | "map" | "unsure" | "problem" | "doc";
  node?: Node;
  kbd?: string;
  run: () => void;
}

/**
 * How well `q` matches `text`: every character of the query in order, scored
 * higher for a run of adjacent characters and for starting a word. Null when
 * it does not match at all.
 */
function score(q: string, text: string): number | null {
  if (!q) return 0;
  const t = text.toLowerCase();
  const at = t.indexOf(q);
  if (at !== -1) return 100 - at + (at === 0 || t[at - 1] === " " ? 50 : 0);
  let s = 0;
  let i = 0;
  let prev = -2;
  for (const ch of q) {
    const j = t.indexOf(ch, i);
    if (j === -1) return null;
    s += j === prev + 1 ? 3 : j === 0 || t[j - 1] === " " ? 2 : 0;
    prev = j;
    i = j + 1;
  }
  return s;
}

export function Palette() {
  const map = useMap();
  const router = useRouter();
  const { path } = useLocation();
  const [mode, setMode] = useState<PaletteMode | null>(null);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const show = (m: PaletteMode) => {
      setMode(m);
      setQuery(m === "actions" ? ">" : "");
      setSel(0);
    };
    const onOpen = (e: Event) => show((e as CustomEvent<PaletteMode>).detail);
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.code === "KeyK" || (e.code === "KeyP" && !e.shiftKey)) {
        e.preventDefault();
        show("all");
      } else if (e.code === "KeyP" && e.shiftKey) {
        e.preventDefault();
        show("actions");
      }
    };
    window.addEventListener(OPEN, onOpen);
    // Capture, so a focused terminal does not swallow the shortcut.
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener(OPEN, onOpen);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  useEffect(() => {
    if (mode) input.current?.focus();
  }, [mode]);

  const levels = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const walk = (nodes: Node[], at: string[], trail: string[]) => {
      for (const n of nodes) {
        const p = [...at, n.id];
        out.push({
          key: `level:${p.join("/")}`,
          label: n.title,
          hint: trail.join(" › ") || map.RUN.repo,
          kind: "level",
          node: n,
          run: () => goTo(p),
        });
        walk(n.children ?? [], p, [...trail, n.title]);
      }
    };
    out.push({ key: "level:", label: map.RUN.repo, hint: "The top of the map", kind: "level", kbd: "0", run: () => goTo([]) });
    walk(map.L0, [], []);
    return out;
  }, [map]);

  const docList = useDocList();
  const docs = useMemo<Item[]>(
    () =>
      (docList ?? []).map((d) => ({
        key: `doc:${d.path}`,
        // The file is what people call a doc; its heading says what is in it.
        label: d.path,
        hint: d.title || undefined,
        kind: "doc" as const,
        run: () => openDoc(d.path),
      })),
    [docList],
  );

  const actions = useMemo<Item[]>(() => {
    const theme = (t: "light" | "dark" | "system") => () => saveSettings({ ...readSettings(), theme: t });
    return [
      { key: "a:back", label: "Go back a level", kind: "action", kbd: "Esc", run: () => path.length && goTo(path.slice(0, -1)) },
      { key: "a:workspace", label: "Toggle Claude Code & terminal", kind: "action", kbd: "Ctrl+`", run: toggleWorkspace },
      { key: "a:diff", label: "What changed in the code", hint: "Diff two commits over the map", kind: "action", run: openDiff },
      { key: "a:audit", label: "How this map was made", hint: "What the agent read and decided", kind: "action", run: () => openAudit(map.name) },
      { key: "a:history", label: "What you added to this map", kind: "action", run: openHistory },
      { key: "a:docs", label: "Read the docs…", hint: "The project's Markdown: design notes, decisions", kind: "action", run: () => setTimeout(() => openPalette("docs")) },
      { key: "a:projects", label: "Projects", hint: "Start a new map, or import one", kind: "action", run: () => openProjects() },
      { key: "a:maps", label: "Switch map…", kind: "action", run: () => setTimeout(() => openPalette("maps")) },
      { key: "a:settings", label: "Settings", kind: "action", run: openSettings },
      { key: "a:light", label: "Theme: light", kind: "action", run: theme("light") },
      { key: "a:dark", label: "Theme: dark", kind: "action", run: theme("dark") },
      { key: "a:system", label: "Theme: follow the system", kind: "action", run: theme("system") },
    ];
  }, [map.name, path]);

  const maps = useMemo<Item[]>(
    () =>
      map.maps.map((m) => ({
        key: `map:${m.id}`,
        label: m.label,
        hint: m.id === map.name ? "open now" : undefined,
        kind: "map" as const,
        run: () => router.push(`?map=${encodeURIComponent(m.id)}`),
      })),
    [map.maps, map.name, router],
  );

  // What the status bar counts, each a way to the level it is on. Walked in
  // map order, so the list reads top to bottom the way the map does.
  const findings = useMemo(() => {
    const unsure: Item[] = [];
    const problems: Item[] = [];
    const walk = (n: Node, p: string[], trail: string[]) => {
      const where = trail.join(" › ") || map.RUN.repo;
      const run = () => goTo(p);
      if (n.state !== "derived") {
        unsure.push({ key: `u:${p.join("/")}`, label: n.title, hint: where, detail: n.unsure, kind: "unsure", node: n, run });
      }
      n.issues?.forEach((is, i) =>
        problems.push({
          key: `p:${p.join("/")}:${i}`,
          label: is.title,
          hint: `in ${n.title}`,
          detail: is.detail,
          kind: "problem",
          run,
        }),
      );
      for (const c of n.children ?? []) walk(c, [...p, c.id], p.length ? [...trail, n.title] : []);
    };
    // The repository itself is a level too (D60), and can carry both.
    walk(map.TOP, [], []);
    return { unsure, problems };
  }, [map]);

  const shown = useMemo(() => {
    const actionsOnly = query.startsWith(">");
    const q = (actionsOnly ? query.slice(1) : query).trim().toLowerCase();
    const pool =
      mode === "maps" ? maps
      : mode === "unsure" ? findings.unsure
      : mode === "problems" ? findings.problems
      : mode === "docs" ? docs
      : actionsOnly ? actions
      : q ? [...levels, ...docs, ...actions]
      : levels;
    return pool
      // A hint counts only as a plain substring: scattered letters across a
      // sentence match nearly anything.
      .map((it) => ({ it, s: score(q, it.label) ?? (it.hint?.toLowerCase().includes(q) ? 1 : null) }))
      .filter((x): x is { it: Item; s: number } => x.s !== null)
      .sort((a, b) => b.s - a.s)
      .slice(0, 60)
      .map((x) => x.it);
  }, [mode, query, levels, docs, actions, maps, findings]);

  useEffect(() => {
    list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!mode) return null;
  const close = () => setMode(null);
  const run = (it: Item | undefined) => {
    if (!it) return;
    close();
    it.run();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-night/15 px-4 pt-[12vh]"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-label="Go to"
        className="flex h-fit max-h-[60vh] w-full max-w-[600px] flex-col overflow-hidden rounded-[10px] border border-border-strong bg-pure-white shadow-lift"
      >
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              close();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, shown.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(shown[sel]);
            }
          }}
          placeholder={
            mode === "maps" ? "Switch to a map…"
            : mode === "unsure" ? `${findings.unsure.length} levels the map is not certain about — filter…`
            : mode === "problems" ? `${findings.problems.length} problems found in the code — filter…`
            : mode === "docs" ? (docList === null ? "Finding the docs…" : `${docList.length} docs in this project — filter…`)
            : "Go to a level, or type > for actions"
          }
          className="h-11 w-full shrink-0 border-b border-border-gray bg-transparent px-4 text-[14px] text-ink placeholder:text-faint focus:outline-none"
        />
        <ul ref={list} role="listbox" className="min-h-0 overflow-y-auto py-1">
          {shown.length ? (
            shown.map((it, i) => (
              <li key={it.key} data-i={i} role="option" aria-selected={i === sel}>
                <button
                  type="button"
                  onPointerMove={() => setSel(i)}
                  onClick={() => run(it)}
                  className={cn(
                    "flex w-full cursor-pointer gap-2.5 px-4 text-left",
                    it.detail ? "items-start py-2" : "items-center py-[7px]",
                    i === sel && "bg-surface-container-low",
                  )}
                >
                  <KindIcon kind={it.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2.5">
                      <span className="truncate text-[13px] text-ink">{it.label}</span>
                      {it.node && it.kind === "level" ? <StateChip state={it.node.state} alarm={it.node.alarm} /> : null}
                      {it.hint ? <span className="min-w-0 truncate text-[12px] text-faint">{it.hint}</span> : null}
                      <span className="flex-1" />
                      {it.kbd ? <Kbd>{it.kbd}</Kbd> : null}
                    </span>
                    {it.detail ? (
                      <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-slate">{it.detail}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-4 py-3 text-[13px] text-faint">
              {mode === "unsure" && !findings.unsure.length
                ? "Every level is certain."
                : mode === "problems" && !findings.problems.length
                  ? "The map found no problems."
                  : mode === "docs" && docList && !docList.length
                    ? "This project has no Markdown."
                    : "Nothing matches."}
            </li>
          )}
        </ul>
        <footer className="flex shrink-0 items-center gap-3 border-t border-border-gray bg-surface px-4 py-1.5 text-[11.5px] text-faint">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
          <span className="flex items-center gap-1"><Kbd>Enter</Kbd> open</span>
          {mode === "all" || mode === "actions" ? <span className="flex items-center gap-1"><Kbd>&gt;</Kbd> actions</span> : null}
          <span className="flex-1" />
          <span className="flex items-center gap-1"><Kbd>Esc</Kbd> close</span>
        </footer>
      </div>
    </div>
  );
}

function KindIcon({ kind }: { kind: Item["kind"] }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        "shrink-0",
        kind === "unsure" ? "mt-[3px] text-amber-ink" : kind === "problem" ? "mt-[3px] text-clay-ink" : "text-faint",
      )}
      aria-hidden
    >
      {kind === "unsure" ? (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M6.3 6.2a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.5-.7 1v.4M8 11.4v.1" />
        </>
      ) : kind === "problem" ? (
        <path d="M8 2 14.5 13.5h-13zM8 6.5v3M8 11.6v.1" />
      ) : kind === "level" ? (
        <>
          <rect x="2" y="2.5" width="12" height="11" rx="2" />
          <path d="M5 6h6M5 9h4" />
        </>
      ) : kind === "doc" ? (
        <DocIcon />
      ) : kind === "map" ? (
        <path d="M1.5 4.5a1 1 0 0 1 1-1h3.6l1.5 1.5h5.9a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
      ) : (
        <path d="m5 4 4 4-4 4M9 12h3" />
      )}
    </svg>
  );
}
