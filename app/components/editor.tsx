"use client";

import { useEffect, useMemo, useRef } from "react";
import { TOKEN_COLOR, highlight, langOf } from "@/lib/highlight";
import { cn } from "@/lib/utils";

/**
 * Code you can type into where you read it: the coloured text of
 * lib/highlight.ts with a transparent textarea laid exactly over it, so the
 * caret, selection, undo and paste are the browser's own and the colours are
 * still the code pane's. Both are one font, one line height and no wrapping,
 * inside one scroller, so they never drift apart.
 *
 * Typing changes only the draft. Writing to disk is the caller's, on ⌘S or
 * its Save button — never on a keystroke, a blur or navigation.
 */
export function CodeEditor({
  file,
  start,
  value,
  onChange,
  onSave,
  readOnly,
  lit,
  className,
}: {
  file: string;
  /** The first line's number in the file. */
  start: number;
  value: string;
  onChange: (next: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
  /** A line to light and bring into view, as the file numbers it. */
  lit?: number;
  className?: string;
}) {
  const painted = useMemo(() => highlight(value, langOf(file)), [value, file]);
  const box = useRef<HTMLDivElement>(null);
  // Indent the way the file already does.
  const indent = /^\t/m.test(value) ? "\t" : "  ";

  useEffect(() => {
    if (!lit || !box.current) return;
    const row = box.current.querySelector<HTMLElement>(`[data-line="${lit}"]`);
    // Scroll this box only: scrollIntoView also scrolls the page, hiding the
    // header above. Once, where the view opened; not again as the reader types.
    if (row) box.current.scrollTop = row.offsetTop - box.current.clientHeight / 2;
  }, [lit]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      onSave?.();
      return;
    }
    if (e.key === "Tab" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && !readOnly) {
      e.preventDefault();
      const t = e.currentTarget;
      const { selectionStart: a, selectionEnd: b } = t;
      onChange(value.slice(0, a) + indent + value.slice(b));
      requestAnimationFrame(() => t.setSelectionRange(a + indent.length, a + indent.length));
    }
  };

  return (
    <div ref={box} className={cn("overflow-auto bg-code", className)}>
      <div className="flex w-max min-w-full py-2 font-mono text-[12.5px] leading-[1.65] [tab-size:4]">
        <div aria-hidden className="tnum sticky left-0 z-10 shrink-0 select-none border-r border-border-gray bg-code text-right text-faint">
          {painted.map((_, i) => (
            <div key={i} data-line={start + i} className={cn("pl-3 pr-2.5", start + i === lit && "bg-amber-surface text-amber-ink")}>
              {start + i}
            </div>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <pre aria-hidden className="pointer-events-none whitespace-pre pl-3 pr-4 text-code-plain">
            {painted.map((line, i) => (
              <div key={i} className={cn(start + i === lit && "bg-amber-surface")}>
                {line.length
                  ? line.map((t, j) => (
                      <span key={j} style={{ color: TOKEN_COLOR[t.kind] }}>
                        {t.text}
                      </span>
                    ))
                  : " "}
              </div>
            ))}
          </pre>
          <textarea
            aria-label={`Code of ${file}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            readOnly={readOnly}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            wrap="off"
            className="absolute inset-0 resize-none overflow-hidden whitespace-pre bg-transparent pl-3 pr-4 text-transparent caret-ink outline-none selection:bg-accent/25 [font:inherit] [tab-size:4]"
          />
        </div>
      </div>
    </div>
  );
}
