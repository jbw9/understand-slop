"use client";

import { useEffect, useMemo, useState } from "react";
import { goTo } from "@/components/chrome";
import { DIALOG, Overlay, QUIET } from "@/components/dialog";
import { openDiff } from "@/components/diff";
import { useMap } from "@/components/map-context";
import { PanelHead } from "@/components/panel";
import { Ident, Prose, StateChip } from "@/components/state";
import type { Node } from "@/lib/data";
import { cn } from "@/lib/utils";

const OPEN = "slop:audit";
/** Show how sure the map on screen is (`id` is its name). */
export const openAudit = (id: string) => window.dispatchEvent(new CustomEvent<string>(OPEN, { detail: id }));

/**
 * How sure the map on screen is, from the map itself: what verification
 * checked and corrected, what is not certain, whether the code moved on.
 * The run's own audit (scripts/generate/audit.ts) is folded at the bottom
 * for debugging the generator. It is Markdown, but only ever the few shapes
 * audit.ts writes — headings, lists, a table, a folded step list, bold,
 * italics, code — so those are drawn here rather than through a Markdown
 * library.
 */
export function AuditDialog() {
  const { TOP, RUN, maps } = useMap();
  const [id, setId] = useState<string | null>(null);
  // undefined while it loads; null when the map has no audit.
  const [text, setText] = useState<string | null | undefined>(undefined);
  // The log is fetched only once someone unfolds it.
  const [wantLog, setWantLog] = useState(false);
  const [behind, setBehind] = useState<string[]>([]);
  const local = maps.some((m) => m.id === id && m.local);

  useEffect(() => {
    const on = (e: Event) => {
      setId((e as CustomEvent<string>).detail);
      setText(undefined);
      setWantLog(false);
      setBehind([]);
    };
    window.addEventListener(OPEN, on);
    return () => window.removeEventListener(OPEN, on);
  }, []);

  useEffect(() => {
    if (!id || !wantLog) return;
    let live = true;
    fetch(`/api/projects?audit=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : { markdown: null }))
      .then((d: { markdown: string | null }) => live && setText(d.markdown))
      .catch(() => live && setText(null));
    return () => {
      live = false;
    };
  }, [id, wantLog]);

  useEffect(() => {
    if (!id || !local) return;
    let live = true;
    fetch(`/api/files?map=${encodeURIComponent(id)}&behind=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((r: { behind: string[] } | null) => live && setBehind(r?.behind ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, local]);

  const sure = useMemo(() => {
    let levels = 0;
    let checked = 0;
    let corrected = 0;
    const look: { path: string[]; node: Node; trail: string; why: string }[] = [];
    const walk = (n: Node, p: string[], trail: string[]) => {
      levels++;
      if (n.verified) checked++;
      corrected += n.verified?.corrected ?? 0;
      const where = trail.join(" › ") || RUN.repo;
      if (n.state !== "derived") look.push({ path: p, node: n, trail: where, why: n.unsure ?? "" });
      else if (n.verified?.corrected)
        look.push({ path: p, node: n, trail: where, why: `${n.verified.corrected} ${n.verified.corrected === 1 ? "claim was" : "claims were"} wrong and corrected in review; the rest of this level held up.` });
      for (const c of n.children ?? []) walk(c, [...p, c.id], p.length ? [...trail, n.title] : []);
    };
    walk(TOP, [], []);
    return { levels, checked, corrected, unsure: look.filter((x) => x.node.state !== "derived").length, look };
  }, [TOP, RUN.repo]);

  if (!id) return null;
  const close = () => setId(null);
  const parsed = text ? parse(text) : [];
  // The log's own title repeats the dialog's.
  const blocks = parsed[0]?.kind === "h1" ? parsed.slice(1) : parsed;

  return (
    <Overlay onClose={close}>
      <div role="dialog" aria-label="How sure is this map" className={cn(DIALOG, "max-w-[720px]")}>
        <PanelHead
          title="How sure is this map"
          note="What was checked against the code, and what to double-check."
          right={
            <button type="button" onClick={close} className={QUIET}>
              Close
            </button>
          }
        />
        <div className="min-h-0 flex-1 overflow-auto px-6 py-5 text-[13.5px] leading-relaxed text-on-surface-variant">
          <div className="grid grid-cols-3 gap-3">
            <Stat
              value={sure.checked ? `${sure.checked}/${sure.levels}` : "—"}
              label="levels checked against the code"
              note={sure.checked ? "A second model read every claim against the lines it cites." : "This map was made before checks were recorded."}
            />
            <Stat value={String(sure.corrected)} label="claims corrected" note="Found wrong in review and rewritten before you saw them." />
            <Stat value={String(sure.unsure)} label="not certain" note="Levels the map could not fully show from the code." warn={sure.unsure > 0} />
          </div>

          {behind.length ? (
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border border-amber-line bg-amber-surface/60 px-3 py-2 text-[13px] text-amber-ink">
              <span>
                Built from <Ident>{RUN.commit?.slice(0, 7) ?? "an earlier commit"}</Ident> · {behind.length} {behind.length === 1 ? "file has" : "files have"} changed since
              </span>
              <button type="button" onClick={() => (close(), openDiff())} className="cursor-pointer text-accent underline">
                See which levels
              </button>
            </p>
          ) : null}

          <h3 className="mb-2 mt-7 text-[15px] font-semibold text-ink">Worth a second look</h3>
          {sure.look.length ? (
            <ul className="flex flex-col divide-y divide-border-gray border border-border-gray">
              {sure.look.map((x) => (
                <li key={x.path.join("/")}>
                  <button
                    type="button"
                    onClick={() => (close(), goTo(x.path))}
                    className="flex w-full cursor-pointer flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-surface-container focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-ink">{x.node.title}</span>
                      <StateChip state={x.node.state} alarm={x.node.alarm} />
                      <span className="ml-auto truncate text-[12px] text-faint">{x.trail}</span>
                    </span>
                    {x.why ? (
                      <span className="text-[12.5px] leading-snug">
                        <Prose text={x.why} />
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-slate">Nothing: every level was shown from the code, and no claim needed correcting.</p>
          )}

          <details className="mt-7" onToggle={(e) => (e.currentTarget.open ? setWantLog(true) : null)}>
            <summary className="cursor-pointer text-[12.5px] text-muted-slate hover:text-ink">Generation log, for debugging the generator</summary>
            <div className="mt-3">
              {text === undefined ? (
                <p className="text-muted-slate">Loading…</p>
              ) : text === null ? (
                <p className="text-muted-slate">This map has no log: it was made before mapping runs kept one.</p>
              ) : (
                blocks.map((b, i) => <Block key={i} b={b} />)
              )}
            </div>
          </details>
        </div>
      </div>
    </Overlay>
  );
}

function Stat({ value, label, note, warn }: { value: string; label: string; note: string; warn?: boolean }) {
  return (
    <div className=" border border-border-gray px-3 py-2.5" title={note}>
      <p className={cn("tnum text-[22px] font-semibold leading-none", warn ? "text-amber-ink" : "text-ink")}>{value}</p>
      <p className="mt-1.5 text-[12px] leading-snug text-muted-slate">{label}</p>
    </div>
  );
}

type Item = { depth: number; marker: string; text: string };
type Parsed =
  | { kind: "h1" | "h2" | "h3" | "p"; text: string }
  | { kind: "list"; items: Item[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "details"; summary: string; body: Parsed[] };

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));

/** audit.md as blocks. Anything it does not recognise is kept as a paragraph, never dropped. */
function parse(md: string): Parsed[] {
  const lines = md.split("\n");
  const out: Parsed[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = /^(#{1,3}) (.*)$/.exec(line);
    if (!line.trim()) continue;
    if (h) {
      out.push({ kind: (["h1", "h2", "h3"] as const)[h[1].length - 1], text: h[2] });
    } else if (line.startsWith("<details>")) {
      const summary = /<summary>(.*)<\/summary>/.exec(line)?.[1] ?? "Details";
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("</details>"); i++) body.push(lines[i]);
      out.push({ kind: "details", summary, body: parse(body.join("\n")) });
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      for (; i < lines.length && lines[i].startsWith("|"); i++) if (!/^\|[-| ]+\|$/.test(lines[i].trim())) rows.push(cells(lines[i]));
      i--;
      out.push({ kind: "table", head: rows[0] ?? [], rows: rows.slice(1) });
    } else if (/^ *(- |\d+\. )/.test(line)) {
      const items: Item[] = [];
      for (; i < lines.length; i++) {
        const m = /^( *)(- |\d+\. )(.*)$/.exec(lines[i]);
        if (!m) break;
        items.push({ depth: Math.floor(m[1].length / 2), marker: m[2].trim(), text: m[3] });
      }
      i--;
      out.push({ kind: "list", items });
    } else {
      // A paragraph runs to the next blank line or block.
      const para = [line];
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#|\||<|- |\d+\. | +- )/.test(lines[i + 1])) para.push(lines[++i]);
      out.push({ kind: "p", text: para.join(" ") });
    }
  }
  return out;
}

function Block({ b }: { b: Parsed }) {
  switch (b.kind) {
    case "h1":
    case "h2":
      return <h3 className="mb-2 mt-7 text-[15px] font-semibold text-ink first:mt-0">{inline(b.text)}</h3>;
    case "h3":
      return <h4 className="mb-1.5 mt-5 text-[13.5px] font-semibold text-ink">{inline(b.text)}</h4>;
    case "p":
      return <p className="mb-2.5">{inline(b.text)}</p>;
    case "list":
      return (
        <ul className="mb-3 flex flex-col gap-1">
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-2" style={{ paddingLeft: it.depth * 18 }}>
              <span className="shrink-0 select-none font-mono text-[12px] text-faint">{it.marker === "-" ? "·" : it.marker}</span>
              <span className="min-w-0">{inline(it.text)}</span>
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="mb-3 overflow-x-auto border border-border-gray">
          <table className="w-full border-collapse text-left text-[12.5px]">
            <thead className="bg-surface-container-low text-ink">
              <tr>
                {b.head.map((c, i) => (
                  <th key={i} className="px-3 py-2 font-semibold">
                    {inline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i} className="border-t border-border-gray align-top">
                  {r.map((c, j) => (
                    <td key={j} className={cn("px-3 py-2", j === 0 && "whitespace-nowrap font-medium text-ink")}>
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "details":
      return (
        <details className="mb-3 border border-border-gray bg-surface px-3 py-2 [&_ul]:mb-0">
          <summary className="cursor-pointer text-[12.5px] font-medium text-ink">{inline(b.summary)}</summary>
          <div className="mt-2 font-mono text-[11.5px]">
            {b.body.map((x, i) => (
              <Block key={i} b={x} />
            ))}
          </div>
        </details>
      );
  }
}

/** **bold**, _italic_ and `code`, the inline marks audit.md uses. */
function inline(text: string): React.ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|(?<![\w])_[^_]+_(?![\w]))/).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
      <Ident key={i}>{part.slice(1, -1)}</Ident>
    ) : part.startsWith("**") && part.endsWith("**") && part.length > 3 ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : /^_.+_$/.test(part) ? (
      <em key={i}>{part.slice(1, -1)}</em>
    ) : (
      part
    ),
  );
}
