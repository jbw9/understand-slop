"use client";

import { AnimatePresence, motion } from "motion/react";
import { Chip, Panel } from "@/components/panel";
import { Eyebrow, StateChip } from "@/components/state";
import type { Detail } from "@/lib/data";

/**
 * Level 2 — the detail behind any node.
 *
 * Order matters here: the finding comes first in plain English, then the
 * caveat (what the analysis could not prove), then the evidence. The caveat is
 * never a footnote — for a `partial` fact it is the most important sentence on
 * screen, because it is the part that tells you not to trust the shape.
 */
export function DetailPane({
  detail,
  onClose,
}: {
  detail: Detail | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence mode="wait">
      {detail ? (
        <motion.aside
          key={detail.title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          className="flex h-full flex-col"
        >
          <Panel flush className="flex h-full flex-col">
            <header className="flex items-start gap-3 border-b border-border-gray bg-surface px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[16px] font-semibold leading-tight tracking-[-0.01em] text-ink">
                    {detail.title}
                  </h2>
                  <StateChip state={detail.state} alarm={detail.alarm} />
                </div>
                {detail.loc ? (
                  <p className="mt-1 font-mono text-[11.5px] text-faint">
                    {detail.loc}
                  </p>
                ) : null}
              </div>
              <button
                onClick={onClose}
                aria-label="Close detail"
                className="-mr-1 -mt-1 rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-container hover:text-ink focus-visible:outline-2 focus-visible:outline-deep-green"
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <path
                    d="M3.5 3.5l8 8M11.5 3.5l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <p className="text-[14px] leading-relaxed text-on-surface-variant">
                {detail.lead}
              </p>

              {detail.caveat ? (
                <div
                  className={
                    detail.alarm
                      ? "mt-4 rounded-[12px] border border-clay-line bg-clay-surface px-4 py-3"
                      : "mt-4 rounded-[12px] border border-amber-line bg-amber-surface px-4 py-3"
                  }
                >
                  <Eyebrow
                    className={detail.alarm ? "text-clay-ink" : "text-amber-ink"}
                  >
                    {detail.state === "inferred"
                      ? "why this is a guess"
                      : "what stopped the analysis"}
                  </Eyebrow>
                  <p
                    className={
                      detail.alarm
                        ? "mt-2 text-[13px] leading-relaxed text-clay-ink"
                        : "mt-2 text-[13px] leading-relaxed text-amber-ink"
                    }
                  >
                    {detail.caveat}
                  </p>
                </div>
              ) : null}

              {detail.facts?.length ? (
                <div className="mt-5">
                  <Eyebrow>evidence</Eyebrow>
                  <ul className="mt-2.5 overflow-hidden rounded-[12px] border border-border-gray">
                    {detail.facts.map((f) => (
                      <li
                        key={f.label}
                        className="flex items-center gap-3 border-b border-border-gray bg-pure-white px-3.5 py-2.5 last:border-b-0"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-on-surface-variant">
                          {f.label}
                        </span>
                        <Chip emphasis="normal" className="text-[11.5px]">
                          {f.value}
                        </Chip>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {detail.code ? (
                <div className="mt-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <Eyebrow>source</Eyebrow>
                    <span className="font-mono text-[11px] text-faint">
                      {detail.code.path}:{detail.code.line}
                    </span>
                  </div>
                  <pre className="mt-2.5 overflow-x-auto rounded-[12px] border border-border-gray bg-surface-container-low px-4 py-3.5 font-mono text-[12px] leading-[1.65] text-on-surface-variant">
                    {detail.code.body}
                  </pre>
                </div>
              ) : null}
            </div>
          </Panel>
        </motion.aside>
      ) : (
        <motion.div
          key="empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="flex h-full items-center justify-center rounded-[20px] border border-dashed border-border-strong bg-surface/60 px-8"
        >
          <p className="max-w-[24ch] text-center text-[13.5px] leading-relaxed text-faint">
            Select anything on the canvas to see what it does and how much of it
            was actually proven.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
