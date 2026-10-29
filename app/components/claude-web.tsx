"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "@/components/chrome";
import { AgentIcon } from "@/components/agents";
import { TOGGLE } from "@/components/workspace";
import { useMap } from "@/components/map-context";

/**
 * A published map's stand-in for the workspace: no shell to run on a static
 * page, so the panel is Claude alone, answering about this map's code. It
 * talks to a Lambda (scripts/pages-claude/index.mjs) that holds the map and
 * the cited files and calls Bedrock; the page itself holds no credentials.
 */
const URL_ = process.env.NEXT_PUBLIC_CLAUDE_URL;

const GAP = 12;
const STATUSBAR = 24;
const WIDTH = 560;

type Line = { role: "user" | "assistant"; text: string } | { role: "tool" | "error"; text: string };

export function ClaudeWeb() {
  const { RUN } = useMap();
  const { crumbs } = useLocation();
  const [open, setOpen] = useState(false);
  // It pulses until it has been opened once, so a first-time reader finds it.
  const [seen, setSeen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Backquote" || !e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener(TOGGLE, toggle);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener(TOGGLE, toggle);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setSeen(true);
    input.current?.focus();
  }, [open]);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [lines]);

  // The map keeps clear of the panel, as it does of the workspace (components/canvas.tsx).
  useEffect(() => {
    const root = document.documentElement.style;
    if (open) root.setProperty("--workspace-inset", `calc(min(${WIDTH}px, 100vw - ${2 * GAP}px) + ${2 * GAP}px)`);
    else root.removeProperty("--workspace-inset");
    return () => void root.removeProperty("--workspace-inset");
  }, [open]);

  const ask = async () => {
    const q = draft.trim();
    if (!q || busy || !URL_) return;
    setDraft("");
    setBusy(true);
    // Only the conversation goes back: what Claude read is its own, and is read again if needed.
    const messages = [...lines.filter((l) => l.role === "user" || l.role === "assistant"), { role: "user", text: q }]
      .filter((l) => l.text.trim())
      .reduce<{ role: string; text: string }[]>((all, l) => {
        // A failed answer leaves two questions in a row; they are sent as one.
        const last = all[all.length - 1];
        if (last?.role === l.role) last.text += `\n\n${l.text}`;
        else all.push({ ...l });
        return all;
      }, []);
    // The function takes at most 15; the oldest exchanges go first.
    while (messages.length > 15) messages.splice(0, 2);
    setLines((ls) => [...ls, { role: "user", text: q }]);
    const append = (role: Line["role"], v: string) =>
      setLines((ls) => {
        const last = ls[ls.length - 1];
        return role === "assistant" && last?.role === "assistant" ? [...ls.slice(0, -1), { role, text: last.text + v }] : [...ls, { role, text: v }];
      });
    try {
      const res = await fetch(URL_, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages, at: crumbs.map((c) => c.title).join(" › ") }),
      });
      if (!res.body) throw new Error();
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const parts = buf.split("\n");
        buf = parts.pop()!;
        for (const p of parts) {
          if (!p) continue;
          const { t, v } = JSON.parse(p) as { t: "text" | "tool" | "error"; v: string };
          append(t === "text" ? "assistant" : t, v);
        }
      }
    } catch {
      append("error", "Could not reach Claude.");
    }
    setBusy(false);
    input.current?.focus();
  };

  return (
    <>
      {open ? null : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Ask Claude about this code (Ctrl+`)"
          className="fixed right-3 top-1.5 z-40 flex cursor-pointer items-center gap-1.5 rounded-full border border-[#D97757]/60 bg-[#252526] px-3 py-1 font-mono text-[12px] text-[#dedede] shadow-[0_0_12px_rgba(217,119,87,0.35)] transition-colors hover:border-[#D97757]"
        >
          {seen ? null : <span aria-hidden className="absolute inset-0 animate-ping rounded-full border border-[#D97757]/70" />}
          <AgentIcon id="claude" className="size-3.5" />
          Ask Claude
        </button>
      )}
      <motion.aside
        aria-label="Claude"
        aria-hidden={!open}
        inert={!open}
        initial={{ x: "110%" }}
        animate={{ x: open ? 0 : "110%" }}
        transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
        style={{ top: GAP, bottom: STATUSBAR + GAP, right: GAP, width: `min(${WIDTH}px, calc(100vw - ${2 * GAP}px))` }}
        data-chrome
        className="fixed z-40 flex flex-col overflow-hidden rounded-[4px] border border-border-gray bg-[#252526] font-mono text-[12.5px] leading-relaxed text-[#dedede] shadow-[0_8px_28px_-8px_rgba(0,0,0,0.35)]"
      >
        <header className="flex h-7 shrink-0 items-center gap-2 bg-surface-container px-3 text-[11.5px] text-muted-slate">
          <AgentIcon id="claude" />
          <span className="text-ink">Claude</span>
          <span className="truncate">· {RUN.repo}</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="ml-auto cursor-pointer px-1 hover:text-ink">
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" onClick={() => input.current?.focus()}>
          <p className="text-[#848484]">
            <span className="text-[#D97757]">✻</span> Ask about {RUN.repo}. Claude reads its code to answer.
          </p>
          {lines.map((l, i) =>
            l.role === "user" ? (
              <p key={i} className="mt-3 whitespace-pre-wrap text-[#848484]">
                &gt; {l.text}
              </p>
            ) : l.role === "tool" ? (
              <p key={i} className="mt-2 text-[#86bab6]">
                ⏺ {l.text}
              </p>
            ) : l.role === "error" ? (
              <p key={i} className="mt-2 text-[#e88080]">
                {l.text}
              </p>
            ) : (
              <p key={i} className="mt-2 whitespace-pre-wrap">
                <span className="text-[#dedede]">⏺ </span>
                {l.text}
              </p>
            ),
          )}
          {busy ? <p className="mt-2 animate-pulse text-[#D97757]">✻ Thinking…</p> : null}
          <div ref={end} />
        </div>
        <div className="flex shrink-0 gap-2 border-t border-[#3a3a3a] px-4 py-2.5">
          <span className="text-[#848484]">&gt;</span>
          <textarea
            ref={input}
            value={draft}
            rows={1}
            maxLength={4000}
            disabled={!URL_}
            placeholder={URL_ ? (busy ? "" : "Ask a question") : "Claude is not set up for this page"}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask();
              }
            }}
            className="min-h-0 flex-1 resize-none bg-transparent text-[#dedede] outline-none placeholder:text-[#5a5a5a] [field-sizing:content] max-h-40"
          />
        </div>
      </motion.aside>
    </>
  );
}
