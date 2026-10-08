"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { TOK_CLASS, highlightLines } from "@/lib/highlight";
import type { CodeUnit } from "@/lib/data";

/**
 * Edits to code units, made in the card.
 *
 * Held in memory, keyed by node id, and never written back: there is no file
 * writer yet, so an edit lives until the page reloads. The authored `CodeUnit`
 * is never mutated — a card shows the edit when there is one and the original
 * otherwise, which is also what makes "revert" a delete rather than a restore.
 *
 * One rule ties the two fields together: the signature is the body's HEAD —
 * everything up to the first line that ends in `{` — read as one line.
 * Editing the body re-reads it; editing the signature rewrites the head, on
 * one line, at the head's own indentation. A signature that wraps across lines
 * (`rename(` then one parameter per line) is collapsed when read and comes
 * back on one line once edited. A parser will do this properly; this is the
 * rule that holds until one exists.
 */

interface Edit {
  signature: string;
  body: string;
}

interface EditStore {
  edits: Record<string, Edit>;
  set: (id: string, edit: Edit) => void;
  revert: (id: string) => void;
}

const Ctx = createContext<EditStore | null>(null);

export function EditsProvider({
  onChange,
  children,
}: {
  /** Called after every edit, so wires can re-measure a card that grew. */
  onChange?: () => void;
  children: React.ReactNode;
}) {
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const set = useCallback(
    (id: string, edit: Edit) => {
      setEdits((cur) => ({ ...cur, [id]: edit }));
      onChange?.();
    },
    [onChange],
  );
  const revert = useCallback(
    (id: string) => {
      setEdits((cur) => {
        const next = { ...cur };
        delete next[id];
        return next;
      });
      onChange?.();
    },
    [onChange],
  );
  const store = useMemo(() => ({ edits, set, revert }), [edits, set, revert]);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** The unit as it currently reads — edited if it has been, authored if not. */
export function useUnit(id: string, unit: CodeUnit) {
  const store = useContext(Ctx);
  const edit = store?.edits[id];
  const signature = edit?.signature ?? unit.signature;
  const body = edit?.body ?? unit.body;
  const edited = !!edit && (edit.signature !== unit.signature || edit.body !== unit.body);

  const setSignature = (next: string) => {
    // Swap the head of the body for the new signature, keeping the head's
    // indentation and the opening brace.
    const { head, rest } = splitHead(body);
    const indent = head.match(/^\s*/)?.[0] ?? "";
    const opens = /\{\s*$/.test(head) ? " {" : "";
    const nextBody = indent + next + opens + (rest ? "\n" + rest : "");
    store?.set(id, { signature: next, body: nextBody });
  };

  const setBody = (next: string) => {
    store?.set(id, { signature: readSignature(next), body: next });
  };

  return {
    signature,
    body,
    edited,
    end: unit.start + lineCount(body) - 1,
    setSignature,
    setBody,
    revert: () => store?.revert(id),
  };
}

/**
 * Split a unit into its head (through the first line ending in `{`) and the
 * rest. A unit whose head never opens a brace is all head, one line.
 */
function splitHead(body: string) {
  const lines = body.split("\n");
  let k = lines.findIndex((l) => /\{\s*$/.test(l));
  if (k < 0) k = 0;
  return { head: lines.slice(0, k + 1).join("\n"), rest: lines.slice(k + 1).join("\n") };
}

/**
 * Re-read the signature from the body. Always re-read, never "kept if the body
 * still starts with it": typing at the END of the signature leaves that prefix
 * intact, so a prefix test would miss exactly the edit people make most —
 * adding a parameter or a return type.
 *
 * snecko's generator (lib/snecko.ts) runs the same normalisation, so an
 * authored signature always equals what this reads back.
 */
export function readSignature(body: string) {
  return splitHead(body)
    .head.replace(/\{\s*$/, "") // the opening brace belongs to the body
    .replace(/\s+/g, " ") // a wrapped head reads as one line
    .replace(/\(\s+/g, "(")
    .replace(/,\s*\)/g, ")") // a trailing comma before `)` goes with the wrap
    .trim();
}

function lineCount(code: string) {
  return code.replace(/\n$/, "").split("\n").length;
}

/** Line height of the code text, in px: 10px type at leading 1.55. */
const LINE_H = 15.5;

/**
 * The code, editable, with real line numbers and syntax colour.
 *
 * Laid out like `CodeLines` so a unit reads the same whether or not you are
 * typing in it: same gutter, same type, same numbering from the file's own
 * offset. A textarea rather than contentEditable — it gives undo, selection
 * and IME for free, and the text it holds is exactly the text we keep.
 *
 * The colour comes from a highlighted copy of the text drawn UNDER the
 * textarea, whose own text is transparent (its caret and selection are not).
 * The two have to agree to the pixel, so neither scrolls on its own: both are
 * as wide as the longest line, and the box around them scrolls them together.
 */
export function CodeEditor({
  code,
  lang,
  start,
  onChange,
  label,
}: {
  code: string;
  lang: string;
  start: number;
  onChange: (next: string) => void;
  label: string;
}) {
  const n = lineCount(code);
  const lines = useMemo(() => highlightLines(code, lang), [code, lang]);
  const longest = useMemo(
    () => code.split("\n").reduce((m, l) => Math.max(m, l.length), 0),
    [code],
  );
  return (
    // `data-copy`: a press in here edits text; it must not pick the card up.
    <div data-copy className="flex py-1.5 font-mono text-[10px] leading-[1.55]">
      <div
        aria-hidden
        className="tnum shrink-0 select-none pl-3 pr-2.5 text-right text-faint"
      >
        {Array.from({ length: n }, (_, i) => (
          <div key={i}>{start + i}</div>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="relative" style={{ width: `calc(${longest + 2}ch + 12px)`, minWidth: "100%" }}>
          <pre aria-hidden className="pointer-events-none m-0 whitespace-pre pr-3 font-mono">
            {lines.map((line, i) => (
              <div key={i} style={{ height: LINE_H }}>
                {line.map((t, j) => (
                  <span key={j} className={TOK_CLASS[t.tok]}>
                    {t.text}
                  </span>
                ))}
              </div>
            ))}
          </pre>
          <textarea
            aria-label={label}
            value={code}
            onChange={(e) => onChange(e.target.value)}
            // Tab indents rather than leaving the field: this is code.
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.currentTarget.blur();
                return;
              }
              if (e.key !== "Tab") return;
              e.preventDefault();
              const el = e.currentTarget;
              const { selectionStart: a, selectionEnd: b } = el;
              onChange(code.slice(0, a) + "  " + code.slice(b));
              requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2));
            }}
            // The card toggles its level on click; typing is not a toggle.
            onClick={(e) => e.stopPropagation()}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            rows={n}
            style={{ height: n * LINE_H }}
            className="absolute inset-0 w-full resize-none overflow-hidden whitespace-pre bg-transparent p-0 pr-3 font-mono text-transparent caret-deep-green outline-none selection:bg-mint-line"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The signature, editable in place where it reads. A textarea so a long
 * signature wraps inside the card as it did read-only; newlines are refused,
 * because a signature here is one line (see the invariant above).
 */
export function SignatureField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <textarea
      data-copy
      aria-label="Signature"
      value={value}
      rows={1}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      className={cn(
        "-mx-1 block w-[calc(100%+8px)] resize-none rounded-[4px] border border-transparent bg-transparent px-1 py-0.5 [field-sizing:content]",
        "break-words font-mono text-[10.5px] leading-snug text-on-surface caret-deep-green outline-none",
        "transition-[border-color,background-color] duration-150 hover:border-border-gray focus:border-deep-green focus:bg-pure-white",
      )}
    />
  );
}
