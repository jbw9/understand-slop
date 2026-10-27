"use client";

import { useEffect, useState } from "react";
import { DIALOG, Overlay } from "@/components/dialog";
import { PanelHead } from "@/components/panel";
import { Ident } from "@/components/state";
import { cn } from "@/lib/utils";

const OPEN = "slop:audit";
/** Show how a map was made: the audit its last run wrote (scripts/generate/audit.ts). */
export const openAudit = (id: string) => window.dispatchEvent(new CustomEvent<string>(OPEN, { detail: id }));

/**
 * The run's audit, read as the page it is. It is Markdown, but only ever
 * the few shapes audit.ts writes — headings, lists, a table, a folded step
 * list, bold, italics, code — so those are drawn here rather than through
 * a Markdown library.
 */
export function AuditDialog() {
  const [id, setId] = useState<string | null>(null);
  // undefined while it loads; null when the map has no audit.
  const [text, setText] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const on = (e: Event) => {
      setId((e as CustomEvent<string>).detail);
      setText(undefined);
    };
    window.addEventListener(OPEN, on);
    return () => window.removeEventListener(OPEN, on);
  }, []);

  useEffect(() => {
    if (!id) return;
    let live = true;
    fetch(`/api/projects?audit=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : { markdown: null }))
      .then((d: { markdown: string | null }) => live && setText(d.markdown))
      .catch(() => live && setText(null));
    return () => {
      live = false;
    };
  }, [id]);

  if (!id) return null;
  const parsed = text ? parse(text) : [];
  // The audit's own title names the repo; it heads the dialog instead.
  const top = parsed[0]?.kind === "h1" ? parsed[0].text : null;
  const blocks = top ? parsed.slice(1) : parsed;
  const title = top ?? `How ${id} was mapped`;

  return (
    <Overlay onClose={() => setId(null)}>
      <div role="dialog" aria-label="Audit" className={cn(DIALOG, "max-w-[820px]")}>
        <PanelHead
          title={title}
          note="What the agent read, decided and was corrected on, in the order it happened."
          right={
            <button type="button" onClick={() => setId(null)} className="cursor-pointer text-[13px] text-muted-slate hover:text-ink">
              Close
            </button>
          }
        />
        <div className="min-h-0 flex-1 overflow-auto px-6 py-5 text-[13.5px] leading-relaxed text-on-surface-variant">
          {text === undefined ? (
            <p className="text-muted-slate">Loading…</p>
          ) : text === null ? (
            <p className="text-muted-slate">
              This map has no audit: it was made before mapping runs kept one. Regenerate it from Projects to get one.
            </p>
          ) : (
            blocks.map((b, i) => <Block key={i} b={b} />)
          )}
        </div>
      </div>
    </Overlay>
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
        <div className="mb-3 overflow-x-auto rounded-[8px] border border-border-gray">
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
        <details className="mb-3 rounded-[8px] border border-border-gray bg-surface px-3 py-2 [&_ul]:mb-0">
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
