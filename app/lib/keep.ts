/**
 * Keeping an answer on the map.
 *
 * A reader asks Claude how something works, in a workspace tab, with a section
 * of the map attached (lib/context.ts). The answer explains it and then
 * scrolls away — the one thing that made it land is the one thing the map does
 * not keep.
 *
 * So: when a turn ends, the tab reports its transcript (`ended` in
 * src-tauri/src/pty.rs, written by the Stop hook for EVERY turn, not only the
 * ones that edited code). `lastExchange` reads the question and the answer back
 * out of it. `draftPrompt` then asks Claude to turn its own answer into one
 * block of the map's own vocabulary, which the reader previews and accepts
 * (components/keep.tsx).
 *
 * Claude drafts the block rather than the answer being pasted in verbatim,
 * because a wall of chat prose under the pictures is the thing this tool exists
 * to replace (D38). The reader still gets prose where prose is the honest
 * answer — that is what the `note` kind is for.
 */

import type { Anatomy } from "@/lib/data";

/** What a turn asked and what it answered, read from Claude Code's transcript. */
export interface Exchange {
  asked: string;
  said: string;
}

/**
 * The last question and answer in a session's transcript.
 *
 * Deliberately a copy of the parsing in `scripts/generate/update.ts`'s
 * `account()` rather than a shared helper: that one summarises several turns
 * for a model that is about to rewrite a section, and keeps the tool calls and
 * drops all but the tail of the text. This one needs the opposite — the whole
 * final answer, and no tool noise — and the two will keep wanting different
 * things from the same file.
 */
export function lastExchange(transcript: string, read: (f: string) => string): Exchange | null {
  let entries: unknown[];
  try {
    entries = read(transcript)
      .split("\n")
      .filter(Boolean)
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as unknown];
        } catch {
          return [];
        }
      });
  } catch {
    return null;
  }
  type Entry = { type?: string; isMeta?: boolean; message?: { content?: unknown } };
  const content = (e: Entry) => e?.message?.content;
  const text = (c: unknown) =>
    typeof c === "string"
      ? c
      : Array.isArray(c)
        ? c.filter((b) => (b as { type?: string }).type === "text").map((b) => (b as { text?: string }).text ?? "").join("\n")
        : "";
  // A prompt the reader typed, not a tool's result coming back. Matches
  // `account()`'s test, which is the one that has been exercised in anger.
  const asked = (e: Entry) =>
    e.type === "user" &&
    !e.isMeta &&
    (typeof content(e) === "string" ||
      (Array.isArray(content(e)) && !(content(e) as { type?: string }[]).some((b) => b.type === "tool_result")));

  let question = "";
  let answer = "";
  for (const raw of entries as Entry[]) {
    if (asked(raw)) {
      question = text(content(raw));
      // A new question ends the previous answer: only the last pair is kept.
      answer = "";
      continue;
    }
    if (raw.type !== "assistant") continue;
    const t = text(content(raw));
    if (t.trim()) answer = t;
  }
  if (!answer.trim()) return null;
  // The map context the hook prepended is not the reader's question; it is
  // already on the map, and repeating it back would have Claude draft a block
  // about the block it was given.
  const clean = question.replace(/\[Map (?:section|element|problems):[\s\S]*?\]\s*/g, "").trim();
  return { asked: clean.slice(0, 2000), said: answer.trim().slice(0, 12000) };
}

/** The block kinds a kept answer may become, and when each is the right one. */
const KINDS = `- "diagram": how things connect. boxes[{id,label,sub?,col,row}] on a grid from 0, arrows[{from,to,label?}]. Use where the answer explained a path or a structure.
- "table": real values. {columns:[...], rows:[[...]], state:"derived"}. Every row's cell count must equal columns.length. Use where the answer listed things.
- "sequence": who talks to whom, in order. {actors:[...], rows:[{from,to,label,state:"derived"}]}. Every from/to must be one of actors. Use where the answer described a conversation or a request path.
- "example": what a value looks like. {caption, value}. Use where the answer showed a payload or a shape.
- "note": prose, 1-2 short paragraphs. {body}. Use where the answer's substance really is sentences — a reason, a caveat, a piece of history. Do not force a picture onto one.`;

/**
 * Asks Claude to turn the answer it just gave into one block of the map.
 *
 * Sent through the same tab the reader is already talking to
 * (`lib/context.ts`), so this costs no second backend and no API key. The
 * answer itself is not restated: it is the turn Claude just took, still in
 * that session's context, and pasting it back would have it draft a block
 * about the text rather than about the code it read.
 */
export function draftPrompt(where: string): string {
  return [
    `Put that answer on the map, as one block of the map's own vocabulary.`,
    ``,
    `It goes on the section "${where}". Pick the ONE kind that fits what you just explained:`,
    KINDS,
    ``,
    `Reply with nothing but the JSON object for that one block, starting with {"kind":. No prose, no code fence, no array.`,
    `Rules: every string is plain English and short; no file paths in a label; keep it to what you actually established from the code, and leave out anything you were unsure of rather than hedging it in a label.`,
  ].join("\n");
}

/** Asks Claude to change a draft the reader did not accept. */
export function revisePrompt(block: Anatomy, asked: string): string {
  return [
    `Change that block: ${asked}`,
    ``,
    `This is what it is now:`,
    JSON.stringify(block),
    ``,
    `Reply with nothing but the whole revised JSON object, starting with {"kind":. Keep the same kind unless what I asked for needs a different one.`,
  ].join("\n");
}

/**
 * One block out of Claude's reply. A model asked for bare JSON still sometimes
 * wraps it in a fence or a sentence, so the object is found rather than
 * assumed, and anything that is not one of the kinds the UI can draw is
 * refused — a block the renderer cannot handle would be a blank space the
 * reader had already approved.
 */
export function parseBlock(reply: string): { block: Anatomy } | { error: string } {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : reply;
  const start = body.indexOf("{");
  if (start === -1) return { error: "Claude did not reply with a block." };
  // Balance braces rather than regex: a block holds nested objects and arrays.
  let depth = 0;
  let end = -1;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { end = i + 1; break; }
  }
  if (end === -1) return { error: "Claude's block was cut off." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end));
  } catch {
    return { error: "Claude's block was not valid JSON." };
  }
  const b = parsed as { kind?: string };
  const ok = ["diagram", "table", "sequence", "example", "note"];
  if (!b.kind || !ok.includes(b.kind)) return { error: `"${b.kind ?? "that"}" is not a kind the map can draw.` };
  return { block: parsed as Anatomy };
}
