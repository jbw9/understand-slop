"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { DIALOG, Overlay } from "@/components/dialog";
import { OPEN_DIFF, TINT, WORD, openDiff, useDiff } from "@/components/diff";
import { goTo } from "@/components/chrome";
import { useMap } from "@/components/map-context";
import { hunksOf, type HunkLines } from "@/lib/hunks";
import { TOKEN_COLOR, highlight, langOf } from "@/lib/highlight";
import { cn } from "@/lib/utils";
import type { Commit, FileChange, SectionDiff, Verdict } from "@/lib/diff";

/**
 * The history and what each commit did, laid out the way a code editor's
 * source control is (D75): the commits down the left on one line, the one
 * picked opening onto its files beneath it, and the file picked drawn on the
 * right, side by side or inline. With no file picked the right side is the
 * commit itself — who, when, and which sections of the map it moved, each
 * opening its level, where the red and green are drawn in place
 * (components/diff.tsx).
 *
 * ↑/↓ walk commits and files as one list, so reading a commit is the arrow
 * key and nothing else. ⇧-click a second commit compares the two.
 *
 * Mounted once beside the other dialogs and opened by the same event that
 * turns diff mode on, so there is one way in. Leaving is `off`, in the header.
 */

/**
 * Asks for the panel. The same event that turns diff mode on, so one call both
 * enters the mode and opens its list — which is what a caller that has just
 * set a range (components/acts.tsx) wants.
 */
export const openDiffPanel = openDiff;

type Item = { k: "base" } | { k: "commit"; c: Commit } | { k: "file"; path: string };
type View = "split" | "inline";
const VIEW_KEY = "mira.diff.view";

const STATUS: Record<Exclude<Verdict, "untouched">, string> = { changed: "M", added: "A", removed: "D" };

export function DiffPanel() {
  const d = useDiff();
  const { nodeAt } = useMap();
  const [shown, setShown] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "inline" ? "inline" : "split";
    } catch {
      return "split";
    }
  });
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = () => setShown(true);
    window.addEventListener(OPEN_DIFF, on);
    return () => window.removeEventListener(OPEN_DIFF, on);
  }, []);

  const diff = d?.diff ?? null;
  const all = useMemo(() => d?.commits ?? [], [d?.commits]);
  const q = query.trim().toLowerCase();
  const commits = useMemo(
    () => (q ? all.filter((c) => c.subject.toLowerCase().includes(q) || c.author.toLowerCase().includes(q) || c.sha.startsWith(q)) : all),
    [all, q],
  );

  const is = (c: Commit, ref?: string) => !!ref && (c.sha === ref || c.short === ref || c.sha.startsWith(ref));
  const single = d?.to && d.from === `${d.to}~1` ? d.to : undefined;
  const isBase = !!d && !d.from && !d.to && !d.review;
  const picked = single ? all.find((c) => is(c, single)) : undefined;
  // A pair's ends, as rows: the newer is `to`, the older `from`.
  const ends = !single && d && (d.from || d.to) ? [all.findIndex((c) => is(c, d.to)), all.findIndex((c) => is(c, d.from))] : null;
  const files = d && !d.loading ? (diff?.files ?? []) : [];
  const open = files.find((f) => f.path === file) ?? null;

  const items: Item[] = [{ k: "base" }];
  if (isBase) for (const f of files) items.push({ k: "file", path: f.path });
  for (const c of commits) {
    items.push({ k: "commit", c });
    if (picked === c) for (const f of files) items.push({ k: "file", path: f.path });
  }
  const active = items.findIndex((it) =>
    open ? it.k === "file" && it.path === open.path : it.k === "commit" ? it.c === picked : it.k === "base" && isBase,
  );

  useEffect(() => {
    if (shown) list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [shown, active]);
  useEffect(() => {
    if (shown) list.current?.focus({ preventScroll: true });
  }, [shown]);

  if (!shown || !d) return null;

  function pick(it: Item) {
    if (it.k === "file") return setFile(it.path);
    setFile(null);
    if (it.k === "base") d!.setRange();
    else if (it.c !== picked) d!.setRange(`${it.c.sha}~1`, it.c.sha);
  }

  /** ⇧-click: the commit picked and this one, older to newer. */
  function compare(c: Commit) {
    const anchor = picked ?? (ends && ends[0] >= 0 ? all[ends[0]] : undefined);
    if (!anchor || anchor === c) return pick({ k: "commit", c });
    const [newer, older] = all.indexOf(anchor) < all.indexOf(c) ? [anchor, c] : [c, anchor];
    setFile(null);
    d!.setRange(older.sha, newer.sha);
  }

  const setViewKept = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  /** The trail to a section, in the titles the reader sees rather than ids. */
  const trail = (s: SectionDiff) =>
    s.path
      .slice(0, -1)
      .map((_, i) => nodeAt(s.path.slice(0, i + 1))?.title ?? s.path[i])
      .join(" › ");

  const short = (ref?: string) => (ref ? (all.find((c) => is(c, ref))?.short ?? ref.slice(0, 7)) : "");
  const caption = d.review
    ? `Reviewing ${d.review}`
    : picked
      ? `${picked.short} · ${picked.subject}`
      : single
        ? single
        : d.from || d.to
          ? `Comparing ${short(d.from) || "the map's commit"} → ${short(d.to) || "your working tree"}`
          : "Since the map was made: later commits and your uncommitted work";

  return (
    <Overlay onClose={() => setShown(false)}>
      <div className={DIALOG + " h-full max-w-[1320px]"}>
        <header className="flex shrink-0 items-center gap-3 border-b border-border-gray px-4 py-2.5">
          <h2 className="text-[14px] font-semibold text-ink">Changes</h2>
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted-slate">{caption}</span>
          <div role="group" aria-label="Diff layout" className="flex shrink-0 rounded-[3px] border border-border-gray p-0.5">
            {(["split", "inline"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setViewKept(v)}
                className={cn(
                  "cursor-pointer rounded-[2px] px-2 py-0.5 text-[11.5px]",
                  view === v ? "bg-deep-green/15 text-ink" : "text-muted-slate hover:text-ink",
                )}
              >
                {v === "split" ? "Side by side" : "Inline"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShown(false)}
            title="Close this and keep the map coloured by what changed"
            className="shrink-0 cursor-pointer rounded-[2px] px-2 py-1 text-[12px] text-deep-green hover:bg-surface-container-low"
          >
            See it on the map
          </button>
          <button
            type="button"
            onClick={() => {
              d.off();
              setShown(false);
            }}
            className="shrink-0 cursor-pointer rounded-[2px] px-2 py-1 text-[12px] text-muted-slate hover:bg-surface-container-low hover:text-ink"
          >
            Leave diff
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setShown(false)}
            className="shrink-0 cursor-pointer rounded-[2px] px-1.5 py-0.5 text-[15px] leading-none text-muted-slate hover:bg-surface-container-low hover:text-ink"
          >
            ×
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* ── history ── */}
          <aside className="flex w-[340px] shrink-0 flex-col border-r border-border-gray">
            <div className="shrink-0 border-b border-border-gray p-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter commits by message, author or sha"
                aria-label="Filter commits"
                className="w-full rounded-[2px] border border-border-gray bg-pure-white px-2.5 py-1.5 text-[12px] text-ink placeholder:text-faint focus:border-deep-green focus:outline-none"
              />
            </div>
            <div
              ref={list}
              role="listbox"
              aria-label="Commits and their files"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                e.preventDefault();
                const at = Math.max(0, Math.min(items.length - 1, (active < 0 ? 0 : active) + (e.key === "ArrowDown" ? 1 : -1)));
                pick(items[at]);
              }}
              className="min-h-0 flex-1 overflow-y-auto py-1 outline-none"
            >
              {items.map((it, i) => {
                const on = i === active;
                const last = i === items.length - 1;
                if (it.k === "file") {
                  const f = files.find((x) => x.path === it.path)!;
                  return <FileRow key={`f:${it.path}:${i}`} file={f} on={on} last={last} onPick={() => pick(it)} />;
                }
                if (it.k === "base") {
                  return (
                    <Row key="base" on={on} onPick={() => pick(it)}>
                      <Rail dot="open" first last={last} />
                      <span className="min-w-0 flex-1 py-1.5">
                        <span className="block truncate text-[12.5px] text-ink">Since the map was made</span>
                        <span className="block truncate text-[11px] text-muted-slate">later commits and uncommitted work</span>
                      </span>
                    </Row>
                  );
                }
                const c = it.c;
                const n = all.indexOf(c);
                const inPair = !!ends && n >= Math.max(0, ends[0]) && (ends[1] < 0 || n <= ends[1]);
                return (
                  <Fragment key={c.sha}>
                    <Row on={on} soft={inPair} onPick={(e) => (e.shiftKey ? compare(c) : pick(it))} title={`${c.subject}\n${c.author} · ${new Date(c.at).toLocaleString()}\n${c.sha}`}>
                      <Rail dot={on || inPair ? "on" : "off"} last={last} />
                      <span className="min-w-0 flex-1 py-1.5">
                        <span className="block truncate text-[12.5px] text-ink">{c.subject}</span>
                        <span className="block truncate text-[11px] text-muted-slate">
                          {ago(c.at)} · {c.author}
                        </span>
                      </span>
                      <span className="shrink-0 py-1.5 text-right font-mono text-[10.5px] leading-[1.55]">
                        <span className="block text-faint">{c.short}</span>
                        <span className="tnum block">
                          <span style={{ color: TINT.added.ink }}>+{c.added}</span> <span style={{ color: TINT.removed.ink }}>−{c.removed}</span>
                        </span>
                      </span>
                    </Row>
                    {/* The commit's own paths, from the log, while its diff is read. */}
                    {picked === c && d.loading
                      ? c.files.slice(0, 200).map((p) => (
                          <div key={p} className="flex items-center gap-1.5 pr-3 text-faint">
                            <Rail />
                            <span className="min-w-0 flex-1 truncate pl-3 font-mono text-[11.5px]">{p}</span>
                          </div>
                        ))
                      : null}
                  </Fragment>
                );
              })}
              {!all.length ? <p className="px-4 py-3 text-[12px] text-muted-slate">Reading the history…</p> : null}
              {q && !commits.length ? <p className="px-4 py-3 text-[12px] text-muted-slate">No commit matches “{query}”.</p> : null}
            </div>
            <p className="shrink-0 border-t border-border-gray px-3 py-1.5 text-[11px] text-faint">↑↓ to move · ⇧-click a second commit to compare</p>
          </aside>

          {/* ── what the pick changed ── */}
          <main className="flex min-w-0 flex-1 flex-col">
            {open ? (
              <FilePane
                file={open}
                view={view}
                at={files.indexOf(open)}
                of={files.length}
                onStep={(k) => setFile(files[files.indexOf(open) + k]?.path ?? open.path)}
                onBack={() => setFile(null)}
              />
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <Summary commit={picked} caption={caption} />
                {d.loading ? <p className="mt-4 text-[13px] text-muted-slate">Reading what changed…</p> : null}
                {d.error ? (
                  <p className="mt-4 text-[13px]" style={{ color: TINT.removed.ink }}>
                    {d.error}
                  </p>
                ) : null}
                {diff && !d.loading ? (
                  <>
                    <p className="tnum mt-2 font-mono text-[11.5px] text-muted-slate">
                      {diff.files.length} {diff.files.length === 1 ? "file" : "files"} ·{" "}
                      <span style={{ color: TINT.added.ink }}>+{diff.files.reduce((n, f) => n + f.added, 0)}</span>{" "}
                      <span style={{ color: TINT.removed.ink }}>−{diff.files.reduce((n, f) => n + f.removed, 0)}</span>
                    </p>
                    {/* A file-level answer never pretends to be a section-level one. */}
                    {diff.basis === "files" ? <p className="mt-4 text-[12.5px] leading-snug text-on-surface-variant">{diff.why}</p> : null}
                    {diff.basis === "sections" ? <OnTheMap sections={diff.sections} trail={trail} onOpen={(s) => (goTo(s.path), setShown(false))} /> : null}
                    <h3 className="mt-6 text-[12px] font-medium text-muted-slate">Files — pick one to read its lines</h3>
                    {diff.files.length ? (
                      <div className="mt-1.5 overflow-hidden rounded-[3px] border border-border-gray">
                        {diff.files.map((f) => (
                          <FileRow key={f.path} file={f} flat onPick={() => setFile(f.path)} />
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1.5 text-[13px] text-muted-slate">Nothing changed.</p>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </main>
        </div>
      </div>
    </Overlay>
  );
}

/* ── the history list ────────────────────────────────────────── */

function Row({
  on,
  soft,
  onPick,
  title,
  children,
}: {
  on: boolean;
  soft?: boolean;
  onPick: (e: React.MouseEvent) => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="option"
      aria-selected={on}
      data-active={on}
      title={title}
      onClick={onPick}
      className={cn(
        "flex cursor-pointer select-none items-stretch gap-2 pr-3",
        on ? "bg-deep-green/15" : soft ? "bg-deep-green/[0.06]" : "hover:bg-surface-container-low/60",
      )}
    >
      {children}
    </div>
  );
}

/**
 * The line the history hangs on, one segment per row. `open` is the working
 * tree's hollow dot; `on` is a picked commit.
 */
function Rail({ dot, first, last }: { dot?: "on" | "off" | "open"; first?: boolean; last?: boolean }) {
  return (
    <span aria-hidden className="relative w-6 shrink-0">
      <span className={cn("absolute left-1/2 w-px -translate-x-1/2 bg-border-strong", first ? "top-[15px]" : "top-0", last ? "h-[15px]" : "bottom-0")} />
      {dot ? (
        <span
          className={cn(
            "absolute left-1/2 top-[11px] size-[9px] -translate-x-1/2 rounded-full border-2",
            dot === "open" ? "border-dashed border-muted-slate bg-pure-white" : "border-deep-green",
            dot === "on" ? "bg-deep-green" : dot === "off" ? "bg-pure-white" : undefined,
          )}
        />
      ) : null}
    </span>
  );
}

/** A changed file as a row: name, folder, line counts and its M/A/D letter. */
function FileRow({ file, on, last, flat, onPick }: { file: FileChange; on?: boolean; last?: boolean; flat?: boolean; onPick: () => void }) {
  const t = TINT[file.verdict];
  const cut = file.path.lastIndexOf("/");
  const name = file.path.slice(cut + 1);
  const dir = cut > 0 ? file.path.slice(0, cut) : "";
  const body = (
    <>
      <span className={cn("min-w-0 flex-1 truncate py-[3px] text-[12px]", !flat && "pl-3")}>
        <span className={cn("text-ink", file.verdict === "removed" && "line-through")}>{name}</span>
        {dir ? <span className="ml-1.5 text-[11px] text-faint">{dir}</span> : null}
      </span>
      <span className="tnum shrink-0 font-mono text-[10.5px]">
        <span style={{ color: TINT.added.ink }}>+{file.added}</span> <span style={{ color: TINT.removed.ink }}>−{file.removed}</span>
      </span>
      <span className="w-3 shrink-0 text-center font-mono text-[11px] font-semibold" style={{ color: t.ink }} title={WORD[file.verdict]}>
        {STATUS[file.verdict]}
      </span>
    </>
  );
  if (flat) {
    return (
      <button
        type="button"
        onClick={onPick}
        className="flex w-full cursor-pointer items-center gap-2 border-b border-border-gray px-3 py-1 text-left last:border-b-0 hover:bg-surface-container-low focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-deep-green"
      >
        {body}
      </button>
    );
  }
  return (
    <Row on={!!on} onPick={onPick} title={file.path}>
      <Rail last={last} />
      {body}
    </Row>
  );
}

/* ── the right side ──────────────────────────────────────────── */

function Summary({ commit, caption }: { commit?: Commit; caption: string }) {
  const [copied, setCopied] = useState(false);
  if (!commit) return <h3 className="text-[17px] font-semibold leading-snug text-ink">{caption}</h3>;
  return (
    <>
      <h3 className="text-[17px] font-semibold leading-snug text-ink">{commit.subject}</h3>
      <p className="mt-1.5 text-[12px] text-muted-slate">
        {commit.author} · {new Date(commit.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} ({ago(commit.at)}) ·{" "}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(commit.sha);
            setCopied(true);
          }}
          title="Copy the full sha"
          className="cursor-pointer font-mono hover:text-ink"
        >
          {copied ? "copied" : commit.short}
        </button>
      </p>
    </>
  );
}

/** The sections the change moved, each opening its level. */
function OnTheMap({ sections, trail, onOpen }: { sections: SectionDiff[]; trail: (s: SectionDiff) => string; onOpen: (s: SectionDiff) => void }) {
  const moved = sections.filter((s) => s.verdict !== "untouched");
  return (
    <>
      <h3 className="mt-6 text-[12px] font-medium text-muted-slate">On the map — open one to see it in red and green there</h3>
      {moved.length ? (
        <ul className="mt-1.5 flex flex-col gap-1">
          {moved.map((s) => {
            const t = TINT[s.verdict as Exclude<Verdict, "untouched">];
            return (
              <li key={s.path.join("/")}>
                <button
                  type="button"
                  onClick={() => onOpen(s)}
                  className="flex w-full cursor-pointer items-baseline gap-2 rounded-[3px] border border-border-gray px-3 py-1.5 text-left hover:border-border-strong hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-deep-green"
                >
                  <span className="shrink-0 font-mono text-[12px]" style={{ color: t.ink }}>
                    {t.mark}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    <span className="font-semibold text-ink">{s.title}</span>
                    {trail(s) ? <span className="ml-2 text-[11.5px] text-muted-slate">{trail(s)}</span> : null}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: t.ink }}>
                    {WORD[s.verdict]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1.5 text-[13px] text-muted-slate">No section of the map changed.</p>
      )}
    </>
  );
}

function FilePane({
  file,
  view,
  at,
  of,
  onStep,
  onBack,
}: {
  file: FileChange;
  view: View;
  at: number;
  of: number;
  onStep: (k: 1 | -1) => void;
  onBack: () => void;
}) {
  const hunks = useMemo(() => hunksOf(file.diff), [file.diff]);
  const step = "cursor-pointer rounded-[2px] px-1.5 py-0.5 text-[12px] text-muted-slate hover:bg-surface-container-low hover:text-ink disabled:cursor-default disabled:opacity-40";
  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border-gray px-4 py-2">
        <button type="button" onClick={onBack} className={step}>
          ‹ Commit
        </button>
        <span className="font-mono text-[11px] font-semibold" style={{ color: TINT[file.verdict].ink }}>
          {STATUS[file.verdict]}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{file.path}</span>
        <span className="tnum shrink-0 font-mono text-[11px]">
          <span style={{ color: TINT.added.ink }}>+{file.added}</span> <span style={{ color: TINT.removed.ink }}>−{file.removed}</span>
        </span>
        <span className="tnum shrink-0 text-[11px] text-faint">
          {at + 1} of {of}
        </span>
        <button type="button" aria-label="Previous file" disabled={at <= 0} onClick={() => onStep(-1)} className={step}>
          ↑
        </button>
        <button type="button" aria-label="Next file" disabled={at >= of - 1} onClick={() => onStep(1)} className={step}>
          ↓
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-code">
        {hunks.length ? (
          view === "split" ? (
            <SplitDiff hunks={hunks} path={file.path} />
          ) : (
            <InlineDiff hunks={hunks} path={file.path} />
          )
        ) : (
          <p className="px-4 py-3 text-[12.5px] text-muted-slate">No lines to show: the file is binary, or only its mode changed.</p>
        )}
      </div>
    </>
  );
}

/* ── the lines ───────────────────────────────────────────────── */

type Cell = { n: number; text: string; kind: "+" | "-" | " " } | null;

/** A hunk as rows of [old, new]: removals beside the additions that replaced them. */
function pairsOf(h: HunkLines): [Cell, Cell][] {
  const out: [Cell, Cell][] = [];
  const ls = h.lines;
  for (let i = 0; i < ls.length; ) {
    if (ls[i].kind === " ") {
      out.push([{ n: ls[i].old!, text: ls[i].text, kind: " " }, { n: ls[i].new!, text: ls[i].text, kind: " " }]);
      i++;
      continue;
    }
    const del: Cell[] = [];
    const add: Cell[] = [];
    for (; i < ls.length && ls[i].kind === "-"; i++) del.push({ n: ls[i].old!, text: ls[i].text, kind: "-" });
    for (; i < ls.length && ls[i].kind === "+"; i++) add.push({ n: ls[i].new!, text: ls[i].text, kind: "+" });
    for (let k = 0; k < Math.max(del.length, add.length); k++) out.push([del[k] ?? null, add[k] ?? null]);
  }
  return out;
}

const BG = { "+": TINT.added.surface, "-": TINT.removed.surface, " ": undefined };
// Where one side has no line, the other's is not stretched to meet it.
const FILLER = "repeating-linear-gradient(-45deg, transparent 0 5px, var(--color-border-gray) 5px 6px)";

/** The unchanged lines between two hunks, as one row both sides share. */
function Gap({ h, prev }: { h: HunkLines; prev?: HunkLines }) {
  const end = prev ? Math.max(...prev.lines.map((l) => l.old ?? 0), prev.oldStart - 1) : 0;
  const n = h.oldStart - end - 1;
  return (
    <div className="sticky left-0 h-6 bg-surface-container-low px-3 font-sans text-[10.5px] leading-6 text-faint">
      {n > 0 ? `⋯ ${n} unchanged ${n === 1 ? "line" : "lines"}` : "⋯"}
    </div>
  );
}

function Code({ text, lang }: { text: string; lang: ReturnType<typeof langOf> }) {
  return (
    <code className="whitespace-pre pr-4 text-code-plain">
      {text
        ? highlight(text, lang)[0].map((t, k) => (
            <span key={k} style={{ color: TOKEN_COLOR[t.kind] }}>
              {t.text}
            </span>
          ))
        : " "}
    </code>
  );
}

function SplitDiff({ hunks, path }: { hunks: HunkLines[]; path: string }) {
  const lang = langOf(path);
  const rows = useMemo(() => hunks.map(pairsOf), [hunks]);
  // Each side scrolls sideways on its own, as two editors would; rows are one
  // fixed height so the two stay level without measuring.
  const side = (s: 0 | 1) => (
    <div className={cn("min-w-0 flex-1 overflow-x-auto", s === 1 && "border-l border-border-gray")}>
      <div className="w-max min-w-full font-mono text-[12px]">
        {hunks.map((h, i) => (
          <Fragment key={i}>
            <Gap h={h} prev={hunks[i - 1]} />
            {rows[i].map((r, j) => {
              const c = r[s];
              return (
                <div key={j} className="flex h-5 leading-5" style={{ background: c ? BG[c.kind] : FILLER }}>
                  <span className="tnum w-11 shrink-0 select-none pr-2 text-right text-faint">{c?.n ?? ""}</span>
                  <span className="w-4 shrink-0 select-none text-center" style={{ color: c?.kind === "+" ? TINT.added.ink : TINT.removed.ink }}>
                    {c?.kind === "+" ? "+" : c?.kind === "-" ? "−" : ""}
                  </span>
                  {c ? <Code text={c.text} lang={lang} /> : null}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
  return (
    <div className="flex">
      {side(0)}
      {side(1)}
    </div>
  );
}

function InlineDiff({ hunks, path }: { hunks: HunkLines[]; path: string }) {
  const lang = langOf(path);
  return (
    <div className="overflow-x-auto">
      <div className="w-max min-w-full font-mono text-[12px]">
        {hunks.map((h, i) => (
          <Fragment key={i}>
            <Gap h={h} prev={hunks[i - 1]} />
            {h.lines.map((l, j) => (
              <div key={j} className="flex h-5 leading-5" style={{ background: BG[l.kind] }}>
                <span className="tnum w-11 shrink-0 select-none pr-2 text-right text-faint">{l.old ?? ""}</span>
                <span className="tnum w-11 shrink-0 select-none pr-2 text-right text-faint">{l.new ?? ""}</span>
                <span className="w-4 shrink-0 select-none text-center" style={{ color: l.kind === "+" ? TINT.added.ink : TINT.removed.ink }}>
                  {l.kind === "+" ? "+" : l.kind === "-" ? "−" : ""}
                </span>
                <Code text={l.text} lang={lang} />
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

const RTF = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 hours ago", as a history list says it. */
function ago(iso: string) {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  for (const [unit, size] of UNITS) if (Math.abs(s) >= size) return RTF.format(Math.round(s / size), unit);
  return "just now";
}
