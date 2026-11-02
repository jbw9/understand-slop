"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { DIALOG, Overlay } from "@/components/dialog";
import { OPEN_DIFF, TINT, WORD, openDiff, useDiff } from "@/components/diff";
import { goTo } from "@/components/chrome";
import { useMap } from "@/components/map-context";
import { hunksOf, type HunkLines } from "@/lib/hunks";
import { TOKEN_COLOR, highlight, langOf } from "@/lib/highlight";
import { cn } from "@/lib/utils";
import type { Commit, FileChange, MapDiff, SectionDiff, Verdict } from "@/lib/diff";
import type { Branch, Pull, Review } from "@/lib/review";

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
 * key and nothing else. Comparing is any two commits, as an editor's history
 * does it: "Compare with selected" on a row, or ⇧/⌘-click it; the right side
 * then names both ends and can swap them. It opens on the newest commit —
 * the map keeps itself current, so "since the map was made" is not a
 * question worth a row (D76).
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

type Item = { k: "commit"; c: Commit } | { k: "file"; path: string };
type View = "split" | "inline";
const VIEW_KEY = "mira.diff.view";

const STATUS: Record<Exclude<Verdict, "untouched">, string> = { changed: "M", added: "A", removed: "D" };

export function DiffPanel() {
  const d = useDiff();
  const { nodeAt, name: map } = useMap();
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
  const picked = single ? all.find((c) => is(c, single)) : undefined;
  // Two commits compared: `from` is the base, `to` what it is compared with.
  const pair = !single && d && !d.review && d.from && d.to ? { base: all.find((c) => is(c, d.from)), with: all.find((c) => is(c, d.to)) } : null;
  const span = pair?.base && pair.with ? [all.indexOf(pair.base), all.indexOf(pair.with)].sort((a, b) => a - b) : null;
  const files = d && !d.loading ? (diff?.files ?? []) : [];
  const open = files.find((f) => f.path === file) ?? null;

  const items: Item[] = [];
  for (const c of commits) {
    items.push({ k: "commit", c });
    if (c === (picked ?? pair?.with)) for (const f of files) items.push({ k: "file", path: f.path });
  }
  const active = items.findIndex((it) =>
    open ? it.k === "file" && it.path === open.path : it.k === "commit" && it.c === (picked ?? pair?.with),
  );
  const newest = all[0];
  // Nothing asked for: the newest commit, as a history view opens.
  const idle = !!d && !d.from && !d.to && !d.review;
  useEffect(() => {
    if (shown && idle && newest) d!.setRange(`${newest.sha}~1`, newest.sha);
  }, [shown, idle, newest, d]);

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
    if (it.c !== picked) d!.setRange(`${it.c.sha}~1`, it.c.sha);
  }

  /** The commit in view, compared with `c`: the older is the base. */
  const anchor = picked ?? pair?.with;
  function compare(c: Commit) {
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
    ? d.review.startsWith("turn:")
      ? "What one agent turn changed"
      : d.review.startsWith("pr:")
        ? `Reviewing pull request #${d.review.slice(3)}`
        : `Reviewing ${d.review.split("...")[1]} since it left ${d.review.split("...")[0]}`
    : picked
      ? `${picked.short} · ${picked.subject}`
      : single
        ? single
        : d.from || d.to
          ? `Comparing ${short(d.from) || "the start"} ⇄ ${short(d.to) || "your working tree"}`
          : "Reading the history…";

  return (
    <Overlay onClose={() => setShown(false)}>
      <div className={DIALOG + " h-full max-w-[1320px]"}>
        <header className="flex shrink-0 items-center gap-3 border-b border-border-gray px-4 py-2.5">
          <h2 className="text-[14px] font-semibold text-ink">History</h2>
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
              <ReviewPicker map={map} value={d.review} onPick={d.setReview} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter commits by message, author or sha"
                aria-label="Filter commits"
                className="mt-2 w-full rounded-[2px] border border-border-gray bg-pure-white px-2.5 py-1.5 text-[12px] text-ink placeholder:text-faint focus:border-deep-green focus:outline-none"
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
                const first = i === 0;
                const last = i === items.length - 1;
                if (it.k === "file") {
                  const f = files.find((x) => x.path === it.path)!;
                  return <FileRow key={`f:${it.path}:${i}`} file={f} on={on} last={last} onPick={() => pick(it)} />;
                }
                const c = it.c;
                const n = all.indexOf(c);
                const end = c === pair?.base ? "base" : c === pair?.with ? "compare" : null;
                const inPair = !!span && n >= span[0] && n <= span[1];
                return (
                  <Fragment key={c.sha}>
                    <Row
                      on={on || !!end}
                      soft={inPair}
                      onPick={(e) => (e.shiftKey || e.metaKey || e.ctrlKey ? compare(c) : pick(it))}
                      title={`${c.subject}\n${c.author} <${c.email ?? ""}> · ${new Date(c.at).toLocaleString()}\n${c.sha}`}
                    >
                      <Rail dot={(c.parents?.length ?? 0) > 1 ? "merge" : on || inPair ? "on" : "off"} first={first} last={last} />
                      <span className="min-w-0 flex-1 py-1.5">
                        <span className="flex items-center gap-1">
                          {end ? <EndTag end={end} /> : null}
                          <Refs refs={c.refs} max={2} />
                          <span className="min-w-0 truncate text-[12.5px] text-ink">{c.subject}</span>
                        </span>
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
                      {anchor && anchor !== c ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            compare(c);
                          }}
                          title={`Compare ${c.short} with ${anchor.short}`}
                          className="absolute right-2 top-1/2 hidden -translate-y-1/2 cursor-pointer rounded-[2px] border border-border-strong bg-pure-white px-1.5 py-0.5 text-[10.5px] text-ink shadow-sm hover:border-deep-green group-hover:block"
                        >
                          ⇄ Compare with {anchor.short}
                        </button>
                      ) : null}
                    </Row>
                    {/* The commit's own paths, from the log, while its diff is read. */}
                    {c === picked && d.loading
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
            <p className="shrink-0 border-t border-border-gray px-3 py-1.5 text-[11px] text-faint">↑↓ to move · ⇧ or ⌘-click a second commit to compare</p>
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
                {picked ? (
                  <Details commit={picked} all={all} onPick={(c) => pick({ k: "commit", c })} />
                ) : pair?.base && pair.with ? (
                  <Comparing
                    base={pair.base}
                    other={pair.with}
                    between={span ? span[1] - span[0] : 0}
                    onSwap={() => (setFile(null), d.setRange(d.to, d.from))}
                    onDone={() => pick({ k: "commit", c: pair.with! })}
                  />
                ) : (
                  <h3 className="text-[17px] font-semibold leading-snug text-ink">{caption}</h3>
                )}
                {diff?.review ? <ReviewCard r={diff.review} /> : null}
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
                    {diff.basis === "files" ? <p className="mt-4 text-[12.5px] leading-snug text-on-surface-variant">{diff.why}</p> : null}
                    {diff.basis === "sections" ? <OnTheMap sections={diff.sections} trail={trail} onOpen={(s) => (goTo(s.path), setShown(false))} /> : null}
                    {diff.outside?.length ? <Outside outside={diff.outside} title={(p) => nodeAt(p)?.title ?? p.at(-1)!} onOpen={(p) => (goTo(p), setShown(false))} /> : null}
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

/* ── reviews ─────────────────────────────────────────────────── */

const SELECT =
  "w-full rounded-[2px] border border-border-gray bg-pure-white px-2 py-1.5 text-[12px] text-ink focus:border-deep-green focus:outline-none";

/**
 * Something to review as one change: a pull request or a branch, from where
 * it left its base (lib/review.ts), or one turn of the agent in the app, as
 * the map saw it before and after (scripts/generate/update.ts).
 */
function ReviewPicker({ map, value, onPick }: { map: string; value?: string; onPick: (spec?: string) => void }) {
  const [got, setGot] = useState<{ branches: Branch[]; base: string; pulls?: Pull[]; why?: string; turns: { id: string; prompt: string; at: string }[] } | null>(null);
  useEffect(() => {
    let live = true;
    const read = (q: string) => fetch(`/api/diff?map=${encodeURIComponent(map)}&${q}`).then((r) => r.json());
    Promise.all([read("branches=1"), read("turns=1")])
      .then(([b, t]) => live && setGot({ branches: b.branches ?? [], base: b.base ?? "", pulls: b.pulls, why: b.why, turns: t.turns ?? [] }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [map]);
  return (
    <>
      <select value={value ?? ""} aria-label="Review a pull request, branch or agent turn" onChange={(e) => onPick(e.target.value || undefined)} className={SELECT}>
        <option value="">{got ? "Review a pull request, branch or turn…" : "Reading branches…"}</option>
        {got?.turns.length ? (
          <optgroup label="What the agent changed, turn by turn">
            {got.turns.map((t) => (
              <option key={t.id} value={`turn:${t.id}`}>
                {ago(t.at)} · {t.prompt.slice(0, 70) || "a correction"}
              </option>
            ))}
          </optgroup>
        ) : null}
        {got?.pulls?.length ? (
          <optgroup label="Pull requests">
            {got.pulls.map((p) => (
              <option key={p.number} value={`pr:${p.number}`}>
                #{p.number} {p.title.slice(0, 70)} — {p.author}
              </option>
            ))}
          </optgroup>
        ) : null}
        {got?.branches.length ? (
          <optgroup label={`Branches, since they left ${got.base}`}>
            {got.branches
              .filter((b) => b.name !== got.base)
              .map((b) => (
                <option key={b.name} value={`${got.base}...${b.name}`}>
                  {b.name}
                </option>
              ))}
          </optgroup>
        ) : null}
      </select>
      {got?.why ? <p className="mt-1 text-[11px] leading-snug text-faint">{got.why}</p> : null}
    </>
  );
}

/** What is under review: the pull request as its author described it, the branch and its base, or the turn's prompt. */
function ReviewCard({ r }: { r: Review }) {
  return (
    <div className="mt-3 rounded-[3px] border border-border-gray px-3 py-2">
      {r.kind === "pr" ? (
        <>
          <p className="text-[13px] font-semibold text-ink">
            #{r.number} {r.title}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted-slate">
            {r.author ? `${r.author} wants to merge ` : "Merging "}
            <span className="font-mono">{r.head}</span> into <span className="font-mono">{r.base}</span>
            {r.url ? (
              <>
                {" · "}
                <a href={r.url} target="_blank" rel="noreferrer" className="text-deep-green hover:underline">
                  on GitHub
                </a>
              </>
            ) : null}
          </p>
          {r.body ? <p className="mt-1 line-clamp-3 whitespace-pre-line text-[12px] leading-snug text-on-surface-variant">{r.body}</p> : null}
        </>
      ) : r.kind === "turn" ? (
        <p className="text-[12.5px] text-ink">
          The agent, asked: <span className="italic">{r.title || "to correct the map"}</span>
          <span className="ml-1.5 text-[11.5px] text-muted-slate">· the map before and after it</span>
        </p>
      ) : (
        <p className="text-[12.5px] text-ink">
          What <span className="font-mono">{r.head}</span> did since it left <span className="font-mono">{r.base}</span>
          <span className="ml-1.5 font-mono text-[10.5px] text-faint">
            {r.from.slice(0, 7)}…{r.to.slice(0, 7)}
          </span>
        </p>
      )}
    </div>
  );
}

/** Changed code no level's lines reach: listed with the level nearest it, never dropped. */
function Outside({ outside, title, onOpen }: { outside: NonNullable<MapDiff["outside"]>; title: (path: string[]) => string; onOpen: (path: string[]) => void }) {
  return (
    <>
      <h3 className="mt-6 text-[12px] font-medium text-muted-slate">Changed where no level&apos;s lines reach</h3>
      <ul className="mt-1.5 flex flex-col gap-1">
        {outside.map((o) => (
          <li key={o.path} className="flex items-baseline gap-2 text-[11.5px]">
            <span className="min-w-0 flex-1 truncate font-mono text-on-surface">{o.path}</span>
            {o.near ? (
              <button type="button" onClick={() => onOpen(o.near!)} className="max-w-[50%] shrink-0 cursor-pointer truncate text-deep-green hover:underline">
                near {o.near.map((_, i) => title(o.near!.slice(0, i + 1))).join(" › ")}
              </button>
            ) : (
              <span className="shrink-0 text-amber-ink">not on the map yet</span>
            )}
          </li>
        ))}
      </ul>
    </>
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
        "group relative flex cursor-pointer select-none items-stretch gap-2 pr-3",
        on ? "bg-deep-green/15" : soft ? "bg-deep-green/[0.06]" : "hover:bg-surface-container-low/60",
      )}
    >
      {children}
    </div>
  );
}

/**
 * The line the history hangs on, one segment per row. `on` is a picked
 * commit; `merge` a commit with two parents, drawn on its first parent's line.
 */
function Rail({ dot, first, last }: { dot?: "on" | "off" | "merge"; first?: boolean; last?: boolean }) {
  return (
    <span aria-hidden className="relative w-6 shrink-0">
      <span className={cn("absolute left-1/2 w-px -translate-x-1/2 bg-border-strong", first ? "top-[15px]" : "top-0", last ? "h-[15px]" : "bottom-0")} />
      {dot ? (
        <span
          className={cn(
            "absolute left-1/2 top-[11px] size-[9px] -translate-x-1/2 rounded-full border-2",
            dot === "merge" ? "size-[11px] border-double border-[3px] border-deep-green bg-pure-white" : "border-deep-green",
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

/** Initials on a colour of their own, the same for one email everywhere: no picture is fetched. */
function Avatar({ name, email, size = 32 }: { name: string; email?: string; size?: number }) {
  const key = email || name;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${h % 360} 38% 42%)` }}
    >
      {initials}
    </span>
  );
}

/** Branches and tags at a commit, as chips: the checked-out branch first and marked. */
function Refs({ refs, max }: { refs?: string[]; max?: number }) {
  if (!refs?.length) return null;
  const chips = refs
    .filter((r) => r !== "HEAD" && !r.endsWith("/HEAD"))
    .map((r) => (r.startsWith("HEAD -> ") ? { name: r.slice(8), head: true } : r.startsWith("tag: ") ? { name: r.slice(5), tag: true } : { name: r, remote: r.includes("/") }));
  const shown = max ? chips.slice(0, max) : chips;
  return (
    <>
      {shown.map((c) => (
        <span
          key={c.name}
          title={"head" in c ? `${c.name}, checked out` : "tag" in c ? `tag ${c.name}` : c.name}
          className={cn(
            "max-w-[110px] shrink-0 truncate rounded-[2px] border px-1 font-mono text-[9.5px] leading-[15px]",
            "head" in c ? "border-deep-green bg-deep-green/15 text-ink" : "tag" in c ? "border-amber-line text-amber-ink" : "border-border-strong text-muted-slate",
          )}
        >
          {"tag" in c ? "◆ " : "head" in c ? "● " : ""}
          {c.name}
        </span>
      ))}
      {chips.length > shown.length ? <span className="shrink-0 font-mono text-[9.5px] text-faint">+{chips.length - shown.length}</span> : null}
    </>
  );
}

/** Which end of a comparison a row is. */
function EndTag({ end }: { end: "base" | "compare" }) {
  return (
    <span className="shrink-0 rounded-[2px] bg-deep-green px-1 font-mono text-[9.5px] uppercase leading-[15px] tracking-[0.04em] text-white">
      {end}
    </span>
  );
}

function Sha({ sha }: { sha: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(sha);
        setCopied(true);
      }}
      title={`${sha} — copy`}
      className="cursor-pointer font-mono text-ink hover:underline"
    >
      {copied ? "copied" : sha.slice(0, 7)}
    </button>
  );
}

const longDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** One commit as an editor's commit details give it: who, when, where it sits, and the whole message. */
function Details({ commit, all, onPick }: { commit: Commit; all: Commit[]; onPick: (c: Commit) => void }) {
  const byOther = commit.committer && (commit.committer !== commit.author || commit.committerEmail !== commit.email);
  const row = "grid grid-cols-[88px_1fr] gap-x-3 py-1 text-[12px]";
  return (
    <>
      <div className="flex items-start gap-3">
        <Avatar name={commit.author} email={commit.email} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-ink">
            <span className="font-semibold">{commit.author}</span>
            {commit.email ? <span className="ml-1.5 text-muted-slate">&lt;{commit.email}&gt;</span> : null}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-slate" title={commit.at}>
            committed {ago(commit.at)} · {longDate(commit.at)}
          </p>
        </div>
      </div>
      {commit.refs?.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          <Refs refs={commit.refs} />
        </div>
      ) : null}
      <h3 className="mt-3 text-[17px] font-semibold leading-snug text-ink">{commit.subject}</h3>
      {commit.body ? <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-on-surface-variant">{commit.body}</p> : null}
      <div className="mt-4 border-t border-border-gray pt-2">
        <div className={row}>
          <span className="text-muted-slate">Commit</span>
          <span>
            <Sha sha={commit.sha} />
          </span>
        </div>
        <div className={row}>
          <span className="text-muted-slate">{(commit.parents?.length ?? 0) > 1 ? "Parents" : "Parent"}</span>
          <span className="flex flex-wrap gap-x-3">
            {commit.parents?.length
              ? commit.parents.map((p) => {
                  const c = all.find((x) => x.sha === p);
                  return c ? (
                    <button key={p} type="button" onClick={() => onPick(c)} title={c.subject} className="cursor-pointer font-mono text-deep-green hover:underline">
                      {p.slice(0, 7)}
                    </button>
                  ) : (
                    <span key={p} className="font-mono text-ink">
                      {p.slice(0, 7)}
                    </span>
                  );
                })
              : "none — the first commit"}
            {(commit.parents?.length ?? 0) > 1 ? <span className="text-muted-slate">a merge: changes shown against the first</span> : null}
          </span>
        </div>
        {byOther ? (
          <div className={row}>
            <span className="text-muted-slate">Committer</span>
            <span className="text-ink">
              {commit.committer}
              {commit.committerEmail ? <span className="ml-1.5 text-muted-slate">&lt;{commit.committerEmail}&gt;</span> : null}
              {commit.committed ? <span className="ml-1.5 text-muted-slate">· {longDate(commit.committed)}</span> : null}
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
}

/** Two commits side by side, the base on the left, and the way to swap them. */
function Comparing({ base, other, between, onSwap, onDone }: { base: Commit; other: Commit; between: number; onSwap: () => void; onDone: () => void }) {
  const card = (c: Commit, end: "base" | "compare") => (
    <div className="min-w-0 flex-1 rounded-[3px] border border-border-gray px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <EndTag end={end} />
        <Sha sha={c.sha} />
        <Refs refs={c.refs} max={2} />
      </div>
      <p className="mt-1.5 line-clamp-2 text-[13px] font-semibold leading-snug text-ink">{c.subject}</p>
      <div className="mt-2 flex items-center gap-2">
        <Avatar name={c.author} email={c.email} size={22} />
        <span className="min-w-0 truncate text-[11.5px] text-muted-slate" title={`${c.author} <${c.email ?? ""}> · ${longDate(c.at)}`}>
          {c.author} · {ago(c.at)}
        </span>
      </div>
    </div>
  );
  return (
    <>
      <div className="flex items-stretch gap-2">
        {card(base, "base")}
        <button
          type="button"
          onClick={onSwap}
          title="Swap the two ends"
          className="shrink-0 cursor-pointer self-center rounded-[3px] border border-border-strong px-2 py-1.5 text-[14px] text-ink hover:border-deep-green"
        >
          ⇄
        </button>
        {card(other, "compare")}
      </div>
      <p className="mt-2 text-[12px] text-muted-slate">
        What changed from <span className="font-mono">{base.short}</span> to <span className="font-mono">{other.short}</span>
        {between > 1 ? ` — ${between} commits apart` : ""}.{" "}
        <button type="button" onClick={onDone} className="cursor-pointer text-deep-green hover:underline">
          Stop comparing
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
          ‹ Back
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
