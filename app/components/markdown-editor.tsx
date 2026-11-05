"use client";

import { invoke } from "@tauri-apps/api/core";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { cn } from "@/lib/utils";

/**
 * A Markdown file read as a page and written where it is read, as Obsidian's
 * live preview does: every block is drawn, and the one being edited shows its
 * Markdown in place. The text is split into blocks at blank lines (a fence
 * holds its blank lines), and the block being edited is a fixed range of
 * lines, so typing a blank line inside it does not move the caret into a
 * different block mid-word.
 *
 * As CodeEditor, typing changes only the draft; ⌘S is the caller's save.
 */

type Range = { from: number; to: number };

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** Line ranges of the blocks in `lines`, from line `base`: runs of non-blank lines, a fenced block whole. */
function blocks(lines: string[], base: number): Range[] {
  const out: Range[] = [];
  let open: string | null = null;
  let from = -1;
  lines.forEach((l, i) => {
    const fence = l.match(FENCE)?.[1];
    if (open) {
      if (fence && fence[0] === open[0] && fence.length >= open.length) open = null;
      return;
    }
    if (fence) open = fence;
    if (!l.trim()) {
      if (from >= 0) out.push({ from: base + from, to: base + i });
      from = -1;
    } else if (from < 0) from = i;
  });
  if (from >= 0) out.push({ from: base + from, to: base + lines.length });
  return out;
}

const REHYPE = [rehypeRaw, [rehypeSanitize, defaultSchema]] as NonNullable<React.ComponentProps<typeof Markdown>["rehypePlugins"]>;
const PLUGINS = [remarkGfm];

/** An image beside the file, read off disk; a web one as it is. */
function LocalImg({ dir, src, alt, ...rest }: React.ImgHTMLAttributes<HTMLImageElement> & { dir: string }) {
  const [url, setUrl] = useState<string>();
  const s = typeof src === "string" ? src : undefined;
  const local = s && !/^[a-z][a-z0-9+.-]*:/i.test(s) ? (s.startsWith("/") ? s : `${dir}/${decodeURIComponent(s.split(/[?#]/)[0])}`) : null;
  useEffect(() => {
    if (!local) return;
    let made: string | undefined;
    let gone = false;
    invoke<ArrayBuffer>("file_read", { path: local })
      .then((buf) => {
        made = URL.createObjectURL(new Blob([buf], local.toLowerCase().endsWith(".svg") ? { type: "image/svg+xml" } : {}));
        if (!gone) setUrl(made);
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [local]);
  // eslint-disable-next-line @next/next/no-img-element -- a local file's own image
  return <img {...rest} src={local ? url : s} alt={alt ?? ""} />;
}

const Block = memo(function Block({ text, dir }: { text: string; dir: string }) {
  const components: Components = {
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ),
    img: ({ src, alt, title, width, height }) => <LocalImg dir={dir} src={typeof src === "string" ? src : undefined} alt={alt} title={title} width={width} height={height} />,
    // GFM draws task boxes disabled; here a click ticks them in the text.
    input: ({ type, checked }) => <input type={type} defaultChecked={checked} key={String(checked)} className="cursor-pointer" />,
  };
  return (
    <Markdown remarkPlugins={PLUGINS} rehypePlugins={REHYPE} components={components}>
      {text}
    </Markdown>
  );
});

const TASK = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/gm;

export function MarkdownEditor({
  file,
  value,
  onChange,
  onSave,
  lit,
  className,
}: {
  file: string;
  value: string;
  onChange: (next: string) => void;
  onSave?: () => void;
  /** A line to bring into view, as the file numbers it. */
  lit?: number;
  className?: string;
}) {
  const lines = value.split("\n");
  const [edit, setEdit] = useState<(Range & { caret?: number }) | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const dir = file.slice(0, file.lastIndexOf("/"));

  const all: (Range & { editing?: boolean })[] = edit
    ? [...blocks(lines.slice(0, edit.from), 0), { ...edit, editing: true }, ...blocks(lines.slice(edit.to), edit.to)]
    : blocks(lines, 0);

  // The editing block grows with what it holds, and takes the caret where it was put.
  useLayoutEffect(() => {
    const t = area.current;
    if (!t) return;
    t.style.height = "0";
    t.style.height = `${t.scrollHeight}px`;
  });
  useEffect(() => {
    const t = area.current;
    if (!t || edit?.caret === undefined) return;
    t.focus();
    const at = edit.caret < 0 ? t.value.length : edit.caret;
    t.setSelectionRange(at, at);
    setEdit((e) => (e ? { from: e.from, to: e.to } : e));
  }, [edit?.caret]);

  useEffect(() => {
    if (!lit || !box.current) return;
    const at = [...box.current.querySelectorAll<HTMLElement>("[data-from]")].filter((el) => Number(el.dataset.from) < lit).pop();
    at?.scrollIntoView({ block: "center" });
  }, [lit]);

  const splice = (r: Range, text: string) => {
    const next = [...lines.slice(0, r.from), ...text.split("\n"), ...lines.slice(r.to)];
    onChange(next.join("\n"));
    return r.from + text.split("\n").length;
  };

  const open = (r: Range, caret = -1) => setEdit({ ...r, caret });

  /** A new empty block after the last one, to write into. */
  const append = () => {
    const last = all.at(-1);
    if (last && !lines.slice(last.from, last.to).join("").trim()) return open(last);
    const tail = value.endsWith("\n") ? (value.endsWith("\n\n") ? "" : "\n") : value ? "\n\n" : "";
    const next = value + tail;
    onChange(next);
    const at = next.split("\n").length - 1;
    open({ from: at, to: at + 1 });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, r: Range, i: number) => {
    const t = e.currentTarget;
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      onSave?.();
    } else if (e.key === "Escape") {
      setEdit(null);
    } else if (e.key === "ArrowUp" && t.selectionStart === 0 && t.selectionEnd === 0 && i > 0) {
      e.preventDefault();
      open(all[i - 1]);
    } else if (e.key === "ArrowDown" && t.selectionStart === t.value.length && i < all.length - 1) {
      e.preventDefault();
      open(all[i + 1], 0);
    } else if (e.key === "Tab" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const { selectionStart: a, selectionEnd: b } = t;
      setEdit({ ...r, to: splice(r, t.value.slice(0, a) + "  " + t.value.slice(b)), caret: a + 2 });
    }
  };

  // Edits begin on mousedown, not click: the block left behind redraws
  // between the two and moves what the pointer was on.
  const onBlockDown = (e: React.MouseEvent<HTMLElement>, r: Range) => {
    const target = e.target as HTMLElement;
    if (e.button !== 0 || target.closest("a") || (target instanceof HTMLInputElement && target.type === "checkbox")) return;
    e.preventDefault();
    open(r);
  };
  /** A task box ticked in the drawing is ticked in the text. */
  const onBlockClick = (e: React.MouseEvent<HTMLElement>, r: Range) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement && target.type === "checkbox")) return;
    const nth = [...e.currentTarget.querySelectorAll('input[type="checkbox"]')].indexOf(target);
    let k = 0;
    splice(r, lines.slice(r.from, r.to).join("\n").replace(TASK, (m, a, x, b) => (k++ === nth ? a + (x === " " ? "x" : " ") + b : m)));
  };
  const onEmptyDown = (e: React.MouseEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    append();
  };

  return (
    <div ref={box} className={cn("overflow-auto bg-code", className)} onMouseDown={onEmptyDown}>
      <div className="doc-prose mx-auto min-h-full max-w-[760px] px-8 pb-[40vh] pt-8" onMouseDown={onEmptyDown}>
        {all.length === 0 ? <p className="text-faint">Empty. Click to write.</p> : null}
        {all.map((r, i) =>
          r.editing ? (
            <textarea
              key={`e${r.from}`}
              ref={area}
              aria-label={`Markdown of ${file}`}
              value={lines.slice(r.from, r.to).join("\n")}
              onChange={(e) => setEdit({ from: r.from, to: splice(r, e.target.value) })}
              onKeyDown={(e) => onKeyDown(e, r, i)}
              onBlur={() => setEdit((cur) => (cur?.from === r.from && cur.caret === undefined ? null : cur))}
              spellCheck
              className="-mx-2 block w-[calc(100%+1rem)] resize-none overflow-hidden whitespace-pre-wrap bg-surface-container px-2 py-1 font-mono text-[13px] leading-[1.65] text-ink caret-ink outline-none"
            />
          ) : (
            <div key={`${r.from}:${r.to}`} data-from={r.from + 1} onMouseDown={(e) => onBlockDown(e, r)} onClick={(e) => onBlockClick(e, r)} className="doc-prose -mx-2 cursor-text px-2 hover:bg-surface-container/50">
              <Block text={lines.slice(r.from, r.to).join("\n")} dir={dir} />
            </div>
          ),
        )}
      </div>
    </div>
  );
}
