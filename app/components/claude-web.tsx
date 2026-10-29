"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { goTo, useLocation } from "@/components/chrome";
import { AgentIcon } from "@/components/agents";
import { TOGGLE } from "@/components/workspace";
import { cn } from "@/lib/utils";
import { useMap } from "@/components/map-context";
import { findSection } from "@/lib/act";
import { WEB_TAB, onOpenClaude, onWebPrompt, section, tabEnded, tabStarted, takePicks, unpick, usePicks } from "@/lib/context";

/**
 * A published map's stand-in for the workspace: no shell to run on a static
 * page, so the panel is Claude alone, answering about this map's code. It
 * talks to a Lambda (scripts/pages-claude/index.mjs) that holds the map and
 * the cited files and calls Bedrock; the page itself holds no credentials.
 * As in the app (components/acts.tsx), Claude moves the map to what it is
 * explaining: its show_section arrives here by name and is resolved the same way.
 * And as the app's prompt hook does (src-tauri/src/claude.rs), each question
 * goes with where the reader is and whatever they picked on the map.
 */
const URL_ = process.env.NEXT_PUBLIC_CLAUDE_URL;

const GAP = 12;
const STATUSBAR = 24;
const WIDTH = 560;

/** Markdown as a terminal draws it: the panel's own monospace, colour for emphasis and code. */
const PROSE =
  "min-w-0 flex-1 [&_p]:my-0 [&_p+*]:mt-2 [&_*+p]:mt-2 [&_strong]:font-semibold [&_strong]:text-white [&_em]:text-[#a9bfd4] " +
  "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 " +
  "[&_h1]:mt-3 [&_h1]:font-semibold [&_h1]:text-white [&_h2]:mt-3 [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mt-3 [&_h3]:font-semibold [&_h3]:text-white " +
  "[&_:not(pre)>code]:text-[#d8ae5b] [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-[3px] [&_pre]:bg-[#1e1e1e] [&_pre]:px-3 [&_pre]:py-2 [&_pre]:text-[#dedede] " +
  "[&_a]:text-[#86bab6] [&_a]:underline [&_table]:my-2 [&_td]:border [&_td]:border-[#3a3a3a] [&_td]:px-2 [&_th]:border [&_th]:border-[#3a3a3a] [&_th]:px-2 [&_th]:text-left";

/** A question shows as asked; `sent` is it with the context that went along. */
type Line = { role: "user"; text: string; sent: string } | { role: "assistant" | "tool" | "error"; text: string };

export function ClaudeWeb() {
  const map = useMap();
  const { RUN } = map;
  const { path, crumbs } = useLocation();
  const picks = usePicks(WEB_TAB).filter((p) => p.status === "queued");
  // The section last sent in full: after that only its first line goes, until it changes.
  const told = useRef("");
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
    // The panel is the one tab picks go to, from the moment the page is up.
    tabStarted(WEB_TAB, true);
    const offOpen = onOpenClaude(() => setOpen(true));
    const offPrompt = onWebPrompt((q) => {
      setOpen(true);
      void asking.current(q);
    });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener(TOGGLE, toggle);
      offOpen();
      offPrompt();
      tabEnded(WEB_TAB);
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

  const ask = async (q: string) => {
    if (!q || busy || !URL_) return;
    setBusy(true);
    const where = `[Reading now: ${[RUN.repo, ...crumbs.map((c) => c.title)].join(" › ")}]`;
    const here = section(map, path).text;
    const sent = [where, here === told.current ? "" : here, ...takePicks(WEB_TAB), q].filter(Boolean).join("\n\n");
    told.current = here;
    // Only the conversation goes back: what Claude read is its own, and is read again if needed.
    const messages = [
      ...lines.flatMap((l) => (l.role === "user" ? [{ role: "user", text: l.sent }] : l.role === "assistant" ? [{ role: "assistant", text: l.text }] : [])),
      { role: "user", text: sent },
    ]
      .filter((l) => l.text.trim())
      .reduce<{ role: string; text: string }[]>((all, l) => {
        // A failed answer leaves two questions in a row; they are sent as one.
        const last = all[all.length - 1];
        if (last?.role === l.role) last.text += `\n\n${l.text}`;
        else all.push({ ...l });
        return all;
      }, []);
    // The function takes at most 15, and 60,000 characters; the oldest exchanges go first.
    const size = () => messages.reduce((n, m) => n + m.text.length, 0);
    while (messages.length > 1 && (messages.length > 15 || size() > 60000)) messages.splice(0, 2);
    setLines((ls) => [...ls, { role: "user", text: q, sent }]);
    const append = (role: "assistant" | "tool" | "error", v: string) =>
      setLines((ls) => {
        const last = ls[ls.length - 1];
        return role === "assistant" && last?.role === "assistant" ? [...ls.slice(0, -1), { role, text: last.text + v }] : [...ls, { role, text: v }];
      });
    try {
      const res = await fetch(URL_, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages }),
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
          const { t, v } = JSON.parse(p) as { t: "text" | "tool" | "show" | "error"; v: string };
          if (t === "show") {
            const path = findSection(map, v);
            if (path) goTo(path);
            append("tool", path ? `Showing ${v}` : `No section on this map is called “${v}”`);
          } else append(t === "text" ? "assistant" : t, v);
        }
      }
    } catch {
      append("error", "Could not reach Claude.");
    }
    setBusy(false);
    input.current?.focus();
  };
  // For a question asked from the map (lib/context.ts, ask), which arrives outside React.
  const asking = useRef(ask);
  useEffect(() => {
    asking.current = ask;
  });

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
              <div key={i} className="mt-2 flex gap-2">
                <span className="text-[#dedede]">⏺</span>
                <div className={PROSE}>
                  <Markdown remarkPlugins={[remarkGfm]}>{l.text}</Markdown>
                </div>
              </div>
            ),
          )}
          {busy ? <p className="mt-2 animate-pulse text-[#D97757]">✻ Thinking…</p> : null}
          <div ref={end} />
        </div>
        {picks.length ? (
          <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-[#3a3a3a] px-4 pt-2">
            {picks.map((p) => (
              <span key={p.key} className="flex max-w-full items-center gap-1 rounded-[2px] bg-[#333] px-1.5 py-0.5 text-[11px] text-[#a9bfd4]">
                <span className="truncate">@ {p.title}</span>
                <button type="button" onClick={() => void unpick(WEB_TAB, p.key)} aria-label={`Remove ${p.title}`} className="cursor-pointer text-[#848484] hover:text-white">
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className={cn("flex shrink-0 gap-2 px-4 py-2.5", picks.length ? "" : "border-t border-[#3a3a3a]")}>
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
                if (busy || !draft.trim()) return;
                setDraft("");
                void ask(draft.trim());
              }
            }}
            className="min-h-0 flex-1 resize-none bg-transparent text-[#dedede] outline-none placeholder:text-[#5a5a5a] [field-sizing:content] max-h-40"
          />
        </div>
      </motion.aside>
    </>
  );
}
