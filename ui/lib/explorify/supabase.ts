import type { Node } from "@/lib/data";
/* ═══ 8. SUPABASE ═════════════════════════════════════════════
   Off the path: the floor every root stands on. Five levels: Supabase →
   what is missing → row-level security → what the app needs → the source. */
export const supabase: Node = {
  id: "supabase",
  title: "Supabase",
  sub: "The whole backend: one client on the phone, three tables, two buckets — and no schema here",
  footprint: {
    dirs: ["lib/supabase.ts", "supabase/"],
    files: 6,
  },
  group: { ordering: "set", note: "What the app talks to, and what the repo cannot show about it." },
  shape: { kind: "marks", ids: ["supabase", "postgres"], note: "Postgres behind PostgREST, Auth, Storage, Functions" },
  state: "partial",
  col: 1,
  row: 1,
  detail:
    "Every screen queries the database directly from the phone with the public anon key. That makes row-level security the only thing between any user and any row — and no policy, table or migration is in this repository.",
  evidence: "lib/supabase.ts:9, supabase/",
  children: [
    {
      id: "sb-client",
      title: "Client",
      sub: "One Supabase client, URL and anon key written into the source",
      footprint: { dirs: ["lib/supabase.ts", "app/(auth)/login.tsx"], files: 2 },
      state: "derived",
      col: 0,
      row: 0,
      detail:
        "lib/supabase.ts:5-7 holds the project URL and anon key as literals. An anon key is meant to ship in apps; what it can do is entirely up to the policies.",
      evidence: "lib/supabase.ts:5",
      anatomy: [
        {
          kind: "map",
          caption: "client setting → effect",
          rows: [
            {
              from: "session",
              to: "kept in AsyncStorage and refreshed automatically",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "lib/supabase.ts",
                  start: 9,
                  code: `export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});`,
                  why: "The same AsyncStorage the app's own cache uses — which is why AsyncStorage.clear() at sign-out also wipes the session.",
                },
              ],
            },
            { from: "refresh", to: "started and stopped with the app's foreground state, wired in login.tsx", state: "derived" },
            { from: "other keys", to: "a Google API key at addEvent.tsx:415 and editEvent/[id].tsx:431", state: "derived" },
          ],
        },
      ],
    },
    {
      id: "sb-tables",
      title: "Tables",
      sub: "individual, organizations, events — reconstructed from the queries",
      footprint: { dirs: ["app/", "lib/"], files: 32 },
      group: { ordering: "set", note: "Three tables; the only link between them is a user id." },
      state: "partial",
      col: 0,
      row: 1,
      detail:
        "Column names are read from the code. Types are the shapes the app reads and writes; the database's own types are not in the repo.",
      evidence: "grep .from( across app/ and lib/",
      anatomy: [
        {
          kind: "map",
          caption: "table → what one row is",
          rows: [
            {
              from: "individual",
              to: "one student; id is the auth user id",
              state: "partial",
              under: [
                {
                  kind: "schema",
                  table: "individual",
                  rows: [
                    { name: "id", type: "auth user id", key: "PK", state: "derived" },
                    { name: "email", type: "text", state: "derived" },
                    { name: "full_name", type: "text", state: "derived" },
                    { name: "interests", type: "text[]", state: "derived", note: "values from categories.ts" },
                    { name: "rsvp", type: "event id[]", state: "derived", note: "duplicates events.rsvp" },
                    { name: "saved_events", type: "event id[]", state: "derived", note: "can hold duplicates" },
                    { name: "avatar_url", type: "storage path", nullable: true, state: "derived" },
                    { name: "location", type: "{ city }", nullable: true, state: "inferred", note: "read by the feed, written by nothing" },
                  ],
                  rel: ["expo_push_token is also written, by a line that cannot run (app/index.tsx:35)."],
                },
              ],
            },
            {
              from: "organizations",
              to: "one organisation; id is the auth user id",
              state: "partial",
              under: [
                {
                  kind: "schema",
                  table: "organizations",
                  rows: [
                    { name: "id", type: "auth user id", key: "PK", state: "derived" },
                    { name: "email", type: "text", state: "derived" },
                    { name: "org_name", type: "text", state: "derived" },
                    { name: "type", type: "text[]", state: "derived", note: "categories" },
                    { name: "campus", type: "text", nullable: true, state: "partial", note: "read by Other Events; no reachable writer" },
                    { name: "avatar_url", type: "storage path", nullable: true, state: "derived" },
                    { name: "password", type: "text", nullable: true, state: "partial", note: "plain text, written on reset — if the column exists" },
                  ],
                  rel: ["Profile fields bio, contact_name, contact_email, website, instagram are written by the org profile drawer."],
                },
              ],
            },
            {
              from: "events",
              to: "one event, owned through uuid",
              state: "partial",
              under: [
                {
                  kind: "schema",
                  table: "events",
                  rows: [
                    { name: "id", type: "number", key: "PK", state: "derived" },
                    { name: "uuid", type: "organisation id", key: "FK", state: "derived", note: "→ organizations.id, by convention only" },
                    { name: "campus", type: "text", state: "derived", note: "full university name; the feed's only filter" },
                    { name: "date", type: "YYYY-MM-DD", state: "derived", note: "UTC day" },
                    { name: "time", type: "HH:MM:SS", state: "derived", note: "local time" },
                    { name: "location", type: "{ description, terms }", state: "derived" },
                    { name: "published", type: "boolean", state: "derived", note: "false = draft" },
                    { name: "rsvp", type: "JSON string", nullable: true, state: "derived", note: "every attendee's details" },
                  ],
                  rel: ["Also name, description, type, thumbnail, dress_code, food, room_number, end_time."],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "sb-missing",
      title: "Missing Schema",
      sub: "No migrations, an empty seed file, no policies — the security model is not in the repo",
      footprint: { dirs: ["supabase/"], files: 3 },
      group: { ordering: "set", note: "Things a reader would expect under supabase/, and what is there instead." },
      state: "partial",
      alarm: true,
      col: 0,
      row: 2,
      detail:
        "supabase/ holds a local-dev config.toml, an empty seed.sql and two functions. The tables were made by hand in the hosted project, so their shape and their access rules can only be inferred.",
      evidence: "supabase/seed.sql (0 bytes), no supabase/migrations/",
      anatomy: [
        {
          kind: "map",
          caption: "expected → found",
          rows: [
            { from: "migrations", to: "none", state: "derived" },
            { from: "seed data", to: "seed.sql exists and is empty", state: "derived" },
            {
              from: "row-level security",
              to: "unknowable here — and the app needs it to be loose",
              state: "inferred",
              under: [
                {
                  kind: "map",
                  caption: "what the app's own queries require the policies to allow",
                  rows: [
                    {
                      from: "students update events",
                      to: "joining writes events.rsvp, a row the student does not own",
                      state: "inferred",
                      under: [
                        {
                          kind: "source",
                          file: "app/individual/index/components/joinButton.tsx",
                          start: 46,
                          code: `      // Update event's RSVP data
      const { error: updateEventError } = await supabase
        .from("events")
        .update({ rsvp: JSON.stringify(rsvpData) })
        .eq("id", event.id);`,
                          why: "For this to succeed a student must hold UPDATE on events. Unless a policy limits it to the rsvp column, the same key could rename, unpublish or re-date any event.",
                        },
                      ],
                    },
                    { from: "anyone reads profiles", to: "password reset looks emails up while signed out", state: "inferred" },
                    { from: "students read the RSVP", to: "the feed selects * from events, rsvp included", state: "derived" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "sb-storage",
      title: "Buckets",
      sub: "user_avatar and event_thumbnail, both read through public URLs",
      footprint: { dirs: ["app/individual/account/components/", "app/org/index/"], files: 4 },
      state: "partial",
      col: 0,
      row: 3,
      detail:
        "Avatars and event pictures are uploaded from the phone with timestamp file names and shown via getPublicUrl. For those URLs to load, both buckets must be public; bucket settings are not in the repo.",
      evidence: "app/individual/account/components/Avatar.tsx:27",
      anatomy: [
        {
          kind: "chips",
          caption: "buckets the code names",
          rows: [
            { label: "user_avatar", note: "profile pictures — and an orphan copy of every event picture", state: "derived" },
            { label: "event_thumbnail", note: "event pictures; the URL is stored on the event", state: "derived" },
          ],
        },
      ],
    },
  ],
};
