/**
 * explorify — a real repository, read at ~/Desktop/Code/explorify, commit 59a89b3.
 *
 * An Expo / React Native app for campus events. Two kinds of account share one
 * binary: students (app/individual) find and join events, organisations
 * (app/org) create them and check people in. Everything talks straight to
 * Supabase from the phone; there is no server of the app's own in between.
 *
 * Every fact below was read out of the source. Where the repo cannot settle a
 * question — most often because the database schema and its row-level security
 * are NOT in this repository — the node says so and is marked `partial` or
 * `inferred` rather than filled in plausibly. Code at the leaves is quoted
 * verbatim at its real line, re-read at its offset before being pasted.
 *
 * Cut by THE LIFE OF ONE EVENT. Every user passes the same two steps first
 * (signing up, then being routed by account type on each launch); after that
 * the product is one object passing between two actors: an organisation
 * creates an event, a student finds it, joins it, and the organisation checks
 * them in. The cut by actor ("Student", "Organisation") was rejected: the
 * event and its `rsvp` column are shared by both sides, so that cut would put
 * the writer and the reader of the same string in two different boxes — the
 * "what belongs to what" confusion this tool exists to remove. The three roots
 * that are not steps — accounts, Supabase, server code — sit off the path.
 *
 * DEPTH. Each branch runs four or five levels:
 *
 *   root (what someone does)
 *     → its parts (authored children)
 *       → one part's mechanism (a row that carries `under`)
 *         → the data or decision it turns on (another `under`)
 *           → the source, quoted verbatim
 *
 * NOT QUOTED ON PURPOSE: lib/supabase.ts:5-7 holds the project URL and anon
 * key, and app/org/index/addEvent.tsx:415 holds a Google API key. The findings
 * name those lines; the keys themselves are not copied into this repo.
 */

import type { Anatomy, Edge, Link, Node, Run, Source, State } from "@/lib/data";
import { signup } from "./signup";
import { launch } from "./launch";
import { createEvent } from "./create-event";
import { feed } from "./feed";
import { rsvp } from "./rsvp";
import { checkIn } from "./check-in";
import { account } from "./account";
import { supabase } from "./supabase";
import { server } from "./server";
import { rowId } from "@/lib/data";

export type { State, Anatomy, Node, Edge, Link, Source };

export const RUN: Run = {
  command: "understand-slop map .",
  repo: "explorify",
  about:
    "Cut by the life of one event — an organisation creates it, a student finds and joins it, the organisation checks them in — after the two steps every account passes first.",
  commit: "59a89b3",
  files: 181,
  elapsed: "—",
};

/** The tree as authored. `lib/map.ts` adds a node per deep row. */
export const AUTHORED: Node[] = [signup, launch, createEvent, feed, rsvp, checkIn, account, supabase, server
];

/* The life of one event, in order. Five edges, one chain.

   Sign-up does not literally pass through launch routing — the wizard routes
   itself on success — but every launch after it does, so the order is real for
   any user who opens the app twice. `create-event → feed` is a data precedence:
   a student cannot find an event no organisation has published.

   `account`, `supabase` and `server` are not steps and get no edge. */
export const E0: Edge[] = [
  { from: "signup", to: "launch", state: "derived", label: "every later open goes through", order: 1 },
  // app/_layout.tsx sends an id found in `individual` to app/individual and
  // one found in `organizations` to app/org: two apps from here on.
  { from: "launch", to: "feed", state: "derived", label: "routes students to", order: 2, lane: "Students" },
  { from: "feed", to: "rsvp", state: "derived", label: "opens", order: 3, lane: "Students" },
  { from: "launch", to: "create-event", state: "derived", label: "routes organisations to", order: 2, lane: "Organisations" },
  // ongoing.tsx → eventdetails.tsx:200 → attendees.tsx
  { from: "create-event", to: "check-in", state: "derived", label: "lists the event, whose details open", order: 3, lane: "Organisations" },
  // Where the two apps meet: one writes a row the other reads.
  { from: "create-event", to: "feed", state: "derived", label: "publishes into" },
  { from: "rsvp", to: "check-in", state: "derived", label: "fills the list for" },
];

/* ── row-level links ──────────────────────────────────────────
   A value written in one place and read in another. Row keys follow
   components/anatomy.tsx: `map` anchors on the row's `from`, `flow` on the
   step number, `facts` on the label, `source` on "source". */

export const LINKS: Link[] = [
  // The campus string an organisation (fails to) set is the feed's only filter.
  { from: rowId("ce-form", "campus"), to: rowId("fd-fetch", 1), state: "partial", alarm: true, label: "must match exactly" },
  // Joining writes the string that the feed then caches on every phone.
  { from: rowId("rv-column", "events.rsvp"), to: rowId("fd-fetch", 3), state: "partial", alarm: true, label: "cached by every student" },
  // Check-in rewrites the same string from a stale copy.
  { from: rowId("ci-tap", 3), to: rowId("rv-column", "events.rsvp"), state: "partial", alarm: true, label: "overwrites" },
  // The student's delete button and the function it trusts.
  { from: rowId("ac-delete", "student"), to: rowId("sv-delete", 2), state: "derived", label: "sends the id to" },
  // Sign-up's final insert creates the row the launch lookup asks for.
  { from: rowId("su-stages", 5), to: rowId("ln-lookup", 2), state: "derived", label: "creates the row found by" },
];

export function linksFor(id: string) {
  return LINKS.filter((l) => l.from === id || l.to === id);
}
