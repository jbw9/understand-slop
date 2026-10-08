"use client";

import { cn } from "@/lib/utils";
import { CodeEditor, SignatureField, useUnit } from "@/components/edits";
import type { CodeUnit, NodeKind } from "@/lib/data";

/**
 * The pieces every view draws a node with, so the canvas and the columns
 * speak one card vocabulary: the kind label, and a code unit's editable head
 * and body.
 */

/** What each kind is called on its card. Short, because it sits above a title. */
const KIND_LABEL: Record<NodeKind, string> = {
  journey: "journey",
  page: "page",
  element: "element",
  flow: "flow",
  store: "store",
  module: "module",
  class: "class",
  function: "fn",
};

/**
 * The kind, said once and quietly above the title, so a reader always knows
 * which layer a card belongs to — the surface, the flow behind it, or the code.
 * No colour: green, amber and clay already mean state, and a fourth meaning
 * for colour would make every card ambiguous.
 */
export function KindLabel({ kind }: { kind?: NodeKind }) {
  return (
    <p className="mb-0.5 font-mono text-[9px] uppercase leading-none tracking-[0.09em] text-faint">
      {KIND_LABEL[kind ?? "flow"]}
    </p>
  );
}

/** A code unit's head: its signature, editable, and where it lives. */
export function UnitHead({ id, unit }: { id: string; unit: CodeUnit }) {
  const u = useUnit(id, unit);
  return (
    <>
      <div className="mt-1">
        <SignatureField value={u.signature} onChange={u.setSignature} />
      </div>
      <p className="mt-1 flex items-center gap-1.5 font-mono text-[9.5px] text-faint">
        <span className="min-w-0 truncate">
          {unit.file}:{unit.start}–{u.end}
        </span>
        {/* Said in words rather than as a state: an excerpt is a fact about
            how much we quoted, not about how sure we are. */}
        {unit.complete ? null : <span className="shrink-0">· excerpt</span>}
        {u.edited ? (
          <>
            <span className="shrink-0 text-deep-green">
              · {u.saving?.kind === "saving" ? "saving…" : "edited"}
            </span>
            {u.save ? (
              <button
                type="button"
                data-row
                disabled={u.saving?.kind === "saving"}
                title="Write this unit back to its file (Ctrl+S in the code)"
                onClick={(e) => {
                  e.stopPropagation();
                  void u.save?.();
                }}
                className="ml-auto shrink-0 cursor-pointer rounded-[4px] bg-deep-green px-1.5 font-semibold text-pure-white transition-opacity duration-150 hover:opacity-90 disabled:cursor-default disabled:opacity-60"
              >
                save
              </button>
            ) : null}
            <button
              type="button"
              data-row
              onClick={(e) => {
                e.stopPropagation();
                u.revert();
              }}
              className={cn(
                u.save ? "" : "ml-auto",
                "shrink-0 cursor-pointer rounded-[4px] px-1 text-on-surface-variant transition-[background-color,color] duration-150 hover:bg-surface hover:text-ink",
              )}
            >
              revert
            </button>
          </>
        ) : null}
      </p>
      {u.saving?.kind === "failed" ? (
        // Nothing was written. Revert drops the edit and shows the file as it
        // is now; the edit is kept until then so it can be copied out.
        <p role="alert" className="mt-1 font-mono text-[9.5px] leading-snug text-clay-ink">
          Not saved: {u.saving.message}. Revert to see the file as it is now.
        </p>
      ) : null}
    </>
  );
}

/** A code unit's body, editable, numbered from the file's own offset. */
export function UnitBody({ id, unit }: { id: string; unit: CodeUnit }) {
  const u = useUnit(id, unit);
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[10px] border bg-pure-white transition-[border-color] duration-150 focus-within:border-deep-green",
        u.edited ? "border-border-strong" : "border-border-gray",
      )}
    >
      <CodeEditor
        code={u.body}
        lang={unit.lang}
        start={unit.start}
        onChange={u.setBody}
        onSave={u.save ?? undefined}
        label={`${unit.file} lines ${unit.start}–${u.end}`}
      />
    </div>
  );
}
