import { useSyncExternalStore } from "react";
import { hurry, sendBatch, type Target } from "@/lib/context";

/**
 * A review of what is on screen: notes pinned to things on the map, in a diff
 * or in the code, collected in the review tray (components/review-tray.tsx) and
 * sent to Claude together as one turn.
 *
 * A note is a comment ("this should retry") or a suggested edit: the map's own
 * words for something, rewritten into what they should say. The map is never
 * edited by it — it stays generated from the code — so a suggestion is the
 * code's spec for one turn, and the map after the turn shows whether it took.
 *
 * Kept per map in localStorage, so a review half written survives a reload.
 */

export interface Note {
  id: string;
  kind: "comment" | "suggest";
  /** What it is pinned to, and that thing's text for Claude (lib/context.ts). */
  anchor: Target;
  /** The comment, or what goes with a suggestion. */
  note: string;
  /** A suggestion: the words on screen, and what they should say. */
  before?: string;
  after?: string;
  status: "draft" | "sending" | "sent";
}

/** Where the editor for a new note opens, and what it is for. */
export interface Editing {
  x: number;
  y: number;
  kind: Note["kind"];
  anchor: Target;
  before?: string;
}

interface State {
  map: string | null;
  notes: Note[];
  editing: Editing | null;
}

let state: State = { map: null, notes: [], editing: null };
const listeners = new Set<() => void>();
const set = (next: State) => {
  state = next;
  if (next.map) {
    try {
      localStorage.setItem(KEY + next.map, JSON.stringify(next.notes.filter((n) => n.status !== "sent")));
    } catch {}
  }
  listeners.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
const KEY = "mira.review.";

/** The open map: its notes are loaded, and the next ones are kept with it. */
export function reviewFor(map: string) {
  if (state.map === map) return;
  let notes: Note[] = [];
  try {
    notes = (JSON.parse(localStorage.getItem(KEY + map) ?? "[]") as Note[]).map((n) => ({ ...n, status: "draft" as const }));
  } catch {}
  set({ map, notes, editing: null });
}

export function startNote(e: Editing) {
  set({ ...state, editing: e });
}

export function stopEditing() {
  if (state.editing) set({ ...state, editing: null });
}

export function addNote(n: Omit<Note, "id" | "status">) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  set({ ...state, editing: null, notes: [...state.notes, { ...n, id, status: "draft" }] });
}

export function editNote(id: string, change: Partial<Pick<Note, "note" | "after">>) {
  set({ ...state, notes: state.notes.map((n) => (n.id === id ? { ...n, ...change } : n)) });
}

export function dropNote(id: string) {
  set({ ...state, notes: state.notes.filter((n) => n.id !== id) });
}

export function clearSent() {
  set({ ...state, notes: state.notes.filter((n) => n.status !== "sent") });
}

/** What Claude reads for one note: the thing as the map describes it, then the note. */
export function describeNote(n: Note): string {
  if (n.kind === "suggest")
    return [
      `[Suggested edit — ${n.anchor.title}]`,
      n.anchor.text,
      `On screen it says: "${(n.before ?? "").trim()}"`,
      `It should say: "${(n.after ?? "").trim()}"`,
      n.note.trim() ? `Also: ${n.note.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  return [`[Review comment — ${n.anchor.title}]`, n.anchor.text, `Comment: ${n.note.trim()}`].join("\n");
}

/**
 * Sends every draft note as one turn: each goes to Claude as context with a
 * short prompt saying what to do with them, and `extra` is added to it. Waits
 * for Claude to finish whatever it is doing first.
 */
export async function sendReview(extra: string, now = false) {
  const drafts = state.notes.filter((n) => n.status === "draft");
  if (!drafts.length) return;
  const ids = new Set(drafts.map((n) => n.id));
  const mark = (status: Note["status"]) => set({ ...state, notes: state.notes.map((n) => (ids.has(n.id) ? { ...n, status } : n)) });
  mark("sending");
  const comments = drafts.filter((n) => n.kind === "comment").length;
  const suggests = drafts.length - comments;
  const counted = [
    comments ? `${comments} comment${comments === 1 ? "" : "s"}` : "",
    suggests ? `${suggests} suggested edit${suggests === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" and ");
  const question = [
    `Apply my review (${counted}, attached). For a suggested edit, change the code so the map's wording would become true; for a comment, do what it asks. If one is unclear or would be a bad idea, say so instead of guessing.`,
    extra.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
  try {
    await sendBatch(
      drafts.map((n) => ({ key: `note:${n.id}`, title: n.anchor.title, text: describeNote(n) })),
      question,
      now,
    );
    mark("sent");
  } catch {
    mark("draft");
  }
}

/** While a review waits for Claude to finish: send it now instead (a turn stopped with Escape never says it is done). */
export const sendNow = hurry;

const NONE: Note[] = [];

export function useNotes(): Note[] {
  return useSyncExternalStore(subscribe, () => state.notes, () => NONE);
}

export function useEditing(): Editing | null {
  return useSyncExternalStore(subscribe, () => state.editing, () => null);
}
