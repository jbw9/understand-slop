import type { Node } from "@/lib/data";
/* ═══ 8. SUPABASE BACKEND ═════════════════════════════════════
   Off the path: the floor every root stands on. The root draws what talks to
   what; below it, the client on the phone, the three tables (one level each,
   since each has its own columns, writers and problems), the picture
   buckets, and what the repo does not contain — with the access rules the
   app's own queries imply as their own level. */
export const supabase: Node = {
  id: "supabase",
  title: "Supabase Backend",
  sub: "The whole backend — login, three tables, two picture buckets, functions — called straight from the phone",
  footprint: {
    dirs: ["lib/supabase.ts", "supabase/"],
    files: 6,
  },
  group: { ordering: "set", note: "What the app talks to, and what the repo cannot show about it." },
  shape: { kind: "marks", ids: ["supabase", "postgres"], note: "Postgres behind an automatic API, Auth, Storage, Functions" },
  state: "partial",
  unsure:
    "The tables, their column types and their access rules live in the hosted Supabase project, not in this repository. Everything below about them is reconstructed from the app's own queries.",
  col: 1,
  row: 1,
  detail: "explorify has no server of its own: every screen calls one Supabase project straight from the phone. Only access rules kept in Supabase's dashboard decide who may read or change each row, and they are not in this repo.",
  code: [
    { file: "lib/supabase.ts", start: 9, end: 16, label: "The one client every screen uses" },
    { file: "supabase/config.toml", start: 1, end: 16, label: "Local development settings — the only Supabase config here" },
    { file: "supabase/functions/delete-user/index.ts", start: 6, end: 47, label: "A function using the all-powerful service key" },
  ],
  anatomy: [
    {
      kind: "diagram",
      caption: "What talks to what — every arrow is a call the app makes",
      boxes: [
        { id: "phone", label: "The phone app", sub: "one Supabase client", col: 0, row: 2 },
        { id: "auth", label: "Auth", sub: "accounts, sessions", col: 1, row: 0 },
        { id: "api", label: "Database API", sub: "Postgres; every query via RLS", col: 1, row: 2 },
        { id: "storage", label: "Storage", sub: "picture files", col: 1, row: 4 },
        { id: "fns", label: "Edge functions", sub: "jobs too powerful for a phone", col: 1, row: 5 },
        { id: "ind", label: "individual", sub: "student profiles", col: 2, row: 1 },
        { id: "org", label: "organizations", sub: "organisation profiles", col: 2, row: 2 },
        { id: "ev", label: "events", sub: "events and guest lists", col: 2, row: 3 },
        { id: "av", label: "user_avatar", sub: "profile pictures", col: 2, row: 4 },
        { id: "th", label: "event_thumbnail", sub: "event pictures", col: 2, row: 5 },
        { id: "rules", label: "Tables and rules", sub: "not in this repo", col: 3, row: 2, tone: "warn" },
      ],
      arrows: [
        { from: "phone", to: "auth", label: "sign up, sign in" },
        { from: "phone", to: "api", label: "read, write" },
        { from: "phone", to: "storage", label: "upload" },
        { from: "phone", to: "fns", label: "delete account" },
        { from: "api", to: "ind" },
        { from: "api", to: "org" },
        { from: "api", to: "ev" },
        { from: "storage", to: "av" },
        { from: "storage", to: "th" },
        { from: "fns", to: "ind", label: "skips RLS" },
        { from: "org", to: "rules", label: "defined in dashboard", tone: "warn" },
      ],
    },
    {
      kind: "sequence",
      caption: "One request, end to end",
      actors: ["Phone", "Supabase Auth", "Database API", "Postgres"],
      rows: [
        { from: "Phone", to: "Supabase Auth", label: "sign in: email + password", state: "derived" },
        { from: "Supabase Auth", to: "Phone", label: "session tokens", note: "saved in AsyncStorage", state: "derived" },
        { from: "Phone", to: "Database API", label: "query, with anon key + token", state: "derived" },
        { from: "Database API", to: "Postgres", label: "run it as this user", state: "derived" },
        { from: "Postgres", to: "Postgres", label: "RLS rules filter rows", note: "row-level security, set in the dashboard — the only gate, and not in the repo", state: "partial" },
        { from: "Postgres", to: "Phone", label: "rows, as JSON", state: "derived" },
        { from: "Phone", to: "Supabase Auth", label: "refresh the session", note: "only while the app is in front", state: "derived" },
      ],
    },
  ],
  issues: [
    {
      title: "No schema, rules or migrations in the repo",
      detail:
        "There are no migrations and the seed file is empty, so the tables on these pages are reconstructed from the app's own queries. Nobody can rebuild the database from this repository, review its access rules, or see a change to them in history; a fresh Supabase project would have none of the tables the app expects.",
      where: "supabase/",
    },
  ],
  children: [
    {
      id: "sb-client",
      title: "Connecting From The Phone",
      sub: "One Supabase client, its address and public key written into the source",
      footprint: { dirs: ["lib/supabase.ts", "app/(auth)/login.tsx"], files: 2 },
      state: "derived",
      col: 0,
      row: 0,
      detail: "Every screen shares one Supabase client, made in `lib/supabase.ts` with the project's address and public key written into the file. It keeps the login session on the phone and renews it while the app is in front.",
      code: [
        { file: "lib/supabase.ts", start: 9, end: 16, label: "The client and its session settings" },
        { file: "app/(auth)/login.tsx", start: 23, end: 30, label: "Refreshing only while the app is in front" },
        { file: "app/individual/account/index.tsx", start: 69, end: 79, label: "Signing out also clears the stored session" },
      ],
      anatomy: [
        {
          kind: "table",
          caption: "The client's settings",
          columns: ["Setting", "Value", "Effect"],
          state: "derived",
          rows: [
            ["address and anon key", "written into the file, not configuration", "an anon key is meant to ship in apps and can do only what the access rules allow; changing it means a new build"],
            ["storage", "AsyncStorage", "the same store as the app's own copies; the session survives a restart; AsyncStorage.clear() logs you out"],
            ["autoRefreshToken", "true", "the session is renewed before it expires — login.tsx starts this when the app comes to the front and stops it in the background"],
            ["persistSession", "true", "kept across launches"],
            ["detectSessionInUrl", "false", "there is no web sign-in redirect to read"],
          ],
        },
        {
          kind: "table",
          caption: "Every Supabase Auth call in the app — the screens are explained under Sign Up, Opening The App and Account",
          columns: ["Call", "Used for", "Where"],
          state: "derived",
          rows: [
            ["signUp", "create the account with a made-up password", "registerIndividual.tsx:61, registerOrg.tsx:50"],
            ["verifyOtp", "check the six-digit code (sign-up and password reset)", "registerIndividual.tsx:92, registerOrg.tsx:81, resetPassword.tsx:122"],
            ["updateUser", "set the real password", "registerIndividual.tsx:122, registerOrg.tsx:111, resetPassword.tsx:135"],
            ["signInWithPassword", "log in", "login.tsx:48"],
            ["resetPasswordForEmail", "send a reset code", "resetPassword.tsx:96"],
            ["getUser / getSession", "who is signed in", "launch, Home, Saved tab, account screens"],
            ["onAuthStateChange", "follow sign-in changes", "org/index/index.tsx:64"],
            ["signOut", "log out, delete account", "both account screens"],
            ["startAutoRefresh / stopAutoRefresh", "renew only in the foreground", "login.tsx:26"],
          ],
        },
      ],
    },
    {
      id: "sb-tables",
      title: "The Three Tables",
      sub: "Student profiles, organisation profiles and events — linked only by ids the app keeps in step",
      footprint: { dirs: ["app/", "lib/", "supabase/functions/"], files: 30 },
      group: { ordering: "set", note: "Three tables; the only links between them are ids copied by the app." },
      state: "partial",
      unsure:
        "No table definitions are in the repo. Whether any of these links is a real foreign key, and what happens on delete, depends on the hosted database.",
      col: 0,
      row: 1,
      detail: "Three tables: student profiles, organisation profiles and events, each profile sharing its id with a login account. The links between rows are ids the app copies itself, and nothing in the repo shows the database enforcing them.",
      code: [
        { file: "app/(auth)/registerIndividual.tsx", start: 128, end: 138, label: "A student's row gets the Auth user's id" },
        { file: "app/(auth)/registerOrg.tsx", start: 117, end: 127, label: "So does an organisation's" },
        { file: "app/org/index/addEvent.tsx", start: 222, end: 242, label: "An event records its organisation in uuid" },
        { file: "supabase/functions/delete-user/index.ts", start: 29, end: 47, label: "Deleting an account: one row, then the user" },
      ],
      anatomy: [
        {
          kind: "diagram",
          caption: "How the tables point at each other — dashed lines are ids kept only by the app; launch decides student or organisation by which profile table holds the user's id",
          boxes: [
            { id: "auth", label: "Auth users", sub: "email, password", col: 0, row: 1 },
            { id: "ind", label: "individual", sub: "one per student", col: 1, row: 0 },
            { id: "org", label: "organizations", sub: "one per organisation", col: 1, row: 2 },
            { id: "ev", label: "events", sub: "one per event", col: 2, row: 1 },
          ],
          arrows: [
            { from: "ind", to: "auth", label: "id = user id" },
            { from: "org", to: "auth", label: "id = user id" },
            { from: "ev", to: "org", label: "uuid = organiser" },
            { from: "ev", to: "ind", label: "rsvp keys", tone: "warn" },
            { from: "ind", to: "ev", label: "rsvp, saved_events", tone: "warn" },
          ],
        },
        {
          kind: "table",
          caption: "Every link between rows — ids inside text or arrays can never be foreign keys, so the database cannot clean them up; keeping them in step is the app's job",
          columns: ["From", "Points at", "Kind of link"],
          state: "partial",
          rows: [
            ["individual.id", "the Auth user", "same id, copied at sign-up"],
            ["organizations.id", "the Auth user", "same id, copied at sign-up"],
            ["events.uuid", "organizations.id", "a column — possibly a foreign key, not knowable here"],
            ["keys inside events.rsvp", "individual.id", "text inside JSON — never enforced"],
            ["individual.rsvp", "events.id", "an array of ids — never enforced"],
            ["individual.saved_events", "events.id", "an array of ids — never enforced"],
          ],
        },
      ],
      issues: [
        {
          title: "Deleted accounts leave data behind",
          detail:
            "The delete function removes the student's `individual` row and their Auth user, but their entry — name and contact — stays in every guest list they joined. Organisations call a different function, `delete-organization`, which is not in the repo.",
          where: "supabase/functions/delete-user/index.ts:32",
        },
      ],
      children: [
        {
          id: "sb-individual",
          title: "Student Profiles",
          sub: "The individual table: one row per student",
          footprint: { dirs: ["app/(auth)/registerIndividual.tsx", "app/individual/"], files: 10 },
          state: "partial",
          unsure:
            "Columns are known only from the app's queries; types are the shapes the app reads and writes. Columns the app only reads may not exist at all.",
          col: 0,
          row: 0,
          detail: "One row per student, created at sign-up with id, email, name and interests. Joining, saving and the profile screens fill in the rest; three columns the app reads are written by nothing.",
          code: [
            { file: "app/(auth)/registerIndividual.tsx", start: 128, end: 138, label: "The row is created at sign-up" },
            { file: "app/individual/account/components/EditProfileDrawer.tsx", start: 105, end: 112, label: "Changing interests" },
            { file: "app/individual/account/components/UploadAvatar.tsx", start: 54, end: 76, label: "Setting the profile picture" },
            { file: "app/index.tsx", start: 26, end: 36, label: "The push-token write that cannot run" },
            { file: "app/individual/account/components/EditProfileDrawer.tsx", start: 46, end: 63, label: "Reading major and campus, which nothing writes" },
          ],
          anatomy: [
            {
              kind: "schema",
              table: "individual",
              rows: [
                { name: "id", type: "Auth user id", key: "PK", state: "derived", note: "set at sign-up" },
                { name: "email", type: "text", state: "derived", note: "set at sign-up; password reset looks it up" },
                { name: "full_name", type: "text", state: "derived", note: "set at sign-up; pre-fills the RSVP drawer" },
                { name: "interests", type: "text[]", state: "derived", note: "category values; sign-up and profile drawer" },
                { name: "rsvp", type: "event id[]", nullable: true, state: "derived", note: "joined events, added by joining; duplicates events.rsvp" },
                { name: "saved_events", type: "event id[]", nullable: true, state: "derived", note: "bookmarks, edited by the bookmark; can hold duplicates" },
                { name: "avatar_url", type: "path in user_avatar", nullable: true, state: "derived", note: "set by a new profile picture; other students read it, with id, for guest-list faces" },
                { name: "location", type: "{ city }", nullable: true, state: "partial", note: "read by You Might Like's same-city rule; written by nothing" },
                { name: "major", type: "text", nullable: true, state: "partial", note: "read by the profile drawer; written by nothing" },
                { name: "campus", type: "text", nullable: true, state: "partial", note: "read by the profile drawer; written by nothing" },
                { name: "expo_push_token", type: "text", nullable: true, state: "partial", note: "launch's only write always fails: `token` is never defined" },
              ],
              rel: [
                "id is the Auth user's id — the same value appears as a key inside events.rsvp.",
                "rsvp and saved_events hold events.id values; nothing removes them when an event is deleted.",
              ],
            },
            {
              kind: "example",
              caption: "One student's row (values invented)",
              value: `{
  "id": "3b7e…",
  "email": "ana@illinois.edu",
  "full_name": "Ana Ruiz",
  "interests": ["stem", "social"],
  "rsvp": [42, 57],
  "saved_events": [42, 61, 61],        ← the same id twice: see Join And Save Buttons
  "avatar_url": "individual_1729…jpg"
}`,
            },
          ],
          issues: [
            {
              title: "The push-token write always fails",
              detail:
                "`app/index.tsx` updates `expo_push_token` with `token.data`, but no `token` exists in that file. The error is caught, so nothing visible happens — and no push token is ever stored.",
              where: "app/index.tsx:35",
            },
          ],
        },
        {
          id: "sb-orgs",
          title: "Organisation Profiles",
          sub: "The organizations table: one row per club or society",
          footprint: { dirs: ["app/(auth)/registerOrg.tsx", "app/org/"], files: 8 },
          state: "partial",
          unsure:
            "Columns are known only from the app's queries. `password` is written by password reset, but whether that column exists — the write's error is logged and ignored — cannot be told from here.",
          col: 0,
          row: 1,
          detail: "One row per organisation, created at sign-up and filled in later from its profile drawer. Students read these rows too, and password reset may write a plain-text password into one.",
          code: [
            { file: "app/(auth)/registerOrg.tsx", start: 117, end: 127, label: "The row is created at sign-up" },
            { file: "app/org/account/components/EditProfileDrawer.tsx", start: 106, end: 118, label: "The profile drawer's fields" },
            { file: "app/(auth)/campusSelection.tsx", start: 41, end: 45, label: "The only campus writer, never reached" },
            { file: "app/(auth)/resetPassword.tsx", start: 157, end: 162, label: "Writing the new password in plain text" },
            { file: "app/individual/index/eventdetails.tsx", start: 178, end: 196, label: "Students download the whole row" },
          ],
          anatomy: [
            {
              kind: "schema",
              table: "organizations",
              rows: [
                { name: "id", type: "Auth user id", key: "PK", state: "derived", note: "set at sign-up" },
                { name: "email", type: "text", state: "derived", note: "set at sign-up; password reset matches on it" },
                { name: "org_name", type: "text", state: "derived", note: "set at sign-up; shown on event pages; Search looks it up once per event" },
                { name: "type", type: "text[]", state: "derived", note: "set at sign-up: the categories that describe it" },
                { name: "avatar_url", type: "path in user_avatar", nullable: true, state: "derived", note: "set by the profile picture" },
                { name: "bio", type: "text", nullable: true, state: "derived", note: "profile drawer" },
                { name: "contact_name", type: "text", nullable: true, state: "derived", note: "profile drawer" },
                { name: "contact_email", type: "text", nullable: true, state: "derived", note: "profile drawer" },
                { name: "website", type: "text", nullable: true, state: "derived", note: "profile drawer" },
                { name: "instagram", type: "text", nullable: true, state: "derived", note: "profile drawer" },
                { name: "campus", type: "text", nullable: true, state: "partial", note: "read by Other Events; only writer is campusSelection.tsx, which nothing navigates to" },
                { name: "password", type: "text", nullable: true, state: "partial", note: "plain text, written on reset, matched by email — if it exists" },
              ],
              rel: ["events.uuid holds this row's id.", "A student's event page downloads the organiser's whole row."],
            },
          ],
          issues: [
            {
              title: "Passwords stored in plain text",
              detail:
                "Password reset copies the new password into `organizations.password`. If the column exists, anyone allowed to read organisation rows — including every student opening an event page — can read it.",
              where: "app/(auth)/resetPassword.tsx:161",
            },
            {
              title: "Nothing reachable sets an organisation's campus",
              detail:
                "Other Events filters by `organizations.campus`, but the only screen that writes it is never navigated to, so that tab finds no campus and shows nothing.",
              where: "app/(auth)/campusSelection.tsx:44",
            },
          ],
        },
        {
          id: "sb-events",
          title: "The Events Table",
          sub: "One row per event, with its guest list stored inside it",
          footprint: { dirs: ["app/org/index/", "app/individual/", "lib/localStorage.ts"], files: 14 },
          state: "partial",
          unsure:
            "Columns are known only from the app's queries; types are the shapes the app writes. Whether `uuid` is a real foreign key is not in the repo.",
          col: 0,
          row: 2,
          detail: "One row per event, guest list included, inserted as a draft and published from the preview. Students write only the `rsvp` column; organisations write everything else.",
          code: [
            { file: "app/org/index/addEvent.tsx", start: 222, end: 242, label: "Inserting an event as a draft" },
            { file: "app/org/index/previewEvent.tsx", start: 104, end: 108, label: "Publishing it" },
            { file: "app/org/index/editEvent/[id].tsx", start: 225, end: 242, label: "Editing it" },
            { file: "app/org/index/components/draft.tsx", start: 74, end: 85, label: "Deleting it" },
            { file: "lib/localStorage.ts", start: 49, end: 54, label: "What students download" },
          ],
          anatomy: [
            {
              kind: "diagram",
              caption: "An event row's life",
              boxes: [
                { id: "form", label: "Event form", sub: "organisation", col: 0, row: 0 },
                { id: "draft", label: "Draft", sub: "published = false", col: 1, row: 0 },
                { id: "pub", label: "Published", sub: "via the preview", col: 2, row: 0, tone: "good" },
                { id: "feed", label: "Students download it", sub: "with its guest list", col: 3, row: 0 },
                { id: "edit", label: "Edit form", sub: "descriptive columns", col: 2, row: 1 },
                { id: "join", label: "Join, cancel, check-in", sub: "rsvp only", col: 3, row: 1 },
                { id: "del", label: "Deleted", sub: "from a dashboard list", col: 2, row: 2, tone: "warn" },
              ],
              arrows: [
                { from: "form", to: "draft", label: "insert" },
                { from: "draft", to: "pub", label: "Publish" },
                { from: "pub", to: "feed" },
                { from: "edit", to: "pub", label: "rewrites" },
                { from: "join", to: "pub", label: "rewrites rsvp" },
                { from: "pub", to: "del", tone: "warn" },
              ],
            },
            {
              kind: "schema",
              table: "events",
              rows: [
                { name: "id", type: "number", key: "PK", state: "derived" },
                { name: "uuid", type: "organisation id", key: "FK", state: "partial", note: "→ organizations.id; enforced or not is unknown" },
                { name: "name", type: "text", state: "derived" },
                { name: "description", type: "text", state: "derived" },
                { name: "type", type: "text[]", state: "derived", note: "category values" },
                { name: "campus", type: "text", state: "derived", note: "full university name; the feed's only filter" },
                { name: "date", type: "YYYY-MM-DD", state: "derived", note: "UTC day of the start" },
                { name: "time", type: "HH:MM:SS", state: "derived", note: "local start time — disagrees with date for late-evening events in the Americas" },
                { name: "end_time", type: "HH:MM:SS", state: "derived", note: "local end time" },
                { name: "location", type: "{ description, terms }", state: "derived", note: "from Google Places" },
                { name: "room_number", type: "text", state: "derived" },
                { name: "thumbnail", type: "public URL", nullable: true, state: "derived", note: "full URL into event_thumbnail" },
                { name: "dress_code", type: "text", nullable: true, state: "derived" },
                { name: "food", type: "text", nullable: true, state: "derived", note: "free text; the event page shows food only when it starts with \"Yes\"" },
                { name: "published", type: "boolean", state: "derived", note: "false = draft" },
                { name: "rsvp", type: "JSON as text", nullable: true, state: "derived", note: "the guest list — see Joining And Saving" },
              ],
              rel: [
                "The guest list lives inside the row, so every student who downloads events downloads it.",
              ],
            },
            {
              kind: "table",
              caption: "Who writes the events table",
              columns: ["Who", "What", "Where"],
              state: "derived",
              rows: [
                ["Organisation, event form", "insert, as a draft", "addEvent.tsx:241"],
                ["Organisation, preview", "published = true", "previewEvent.tsx:107"],
                ["Organisation, edit form", "name, place, time, picture, categories…", "editEvent/[id].tsx:227"],
                ["Organisation, dashboard lists", "delete the row", "draft.tsx:76, ongoing.tsx:71, archive.tsx:71"],
                ["Organisation, check-in", "rsvp", "org/index/attendees.tsx:104"],
                ["Student, join or cancel", "rsvp", "rsvpDrawer.tsx:168, joinButton.tsx:49"],
              ],
            },
            {
              kind: "example",
              caption: "What location holds (values invented; shape from Google Places autocomplete)",
              value: `{
  "description": "Siebel Center for Computer Science, North Goodwin Avenue, Urbana, IL, USA",
  "terms": [
    { "offset": 0,  "value": "Siebel Center for Computer Science" },
    { "offset": 36, "value": "North Goodwin Avenue" },
    { "offset": 58, "value": "Urbana" },
    …
  ]
}`,
              notes: [
                { label: "cards show", value: "terms[0].value up to its first comma, then the room number", state: "derived" },
              ],
            },
          ],
          issues: [
            {
              title: "Late-evening events are stored on the next day",
              detail:
                "The form saves `date` from `toISOString()` (the UTC day) but `time` from the local clock. In Chicago in summer, an event starting at 7 pm or later is stored with tomorrow's date and today's time, and every screen shows it a day late.",
              where: "app/org/index/addEvent.tsx:233",
            },
          ],
        },
      ],
    },
    {
      id: "sb-storage",
      title: "Picture Storage",
      sub: "Two buckets — profile pictures and event pictures — shown through public links",
      footprint: { dirs: ["app/individual/account/components/", "app/org/index/"], files: 5 },
      state: "partial",
      unsure:
        "Bucket settings are not in the repo. The app shows pictures through public URLs, which only load if both buckets are public — inferred from that, not seen.",
      col: 0,
      row: 2,
      detail: "Pictures go straight from the phone into two Storage buckets and are shown through public links. Profile rows keep the file's path; event rows keep the full link.",
      code: [
        { file: "app/individual/account/components/UploadAvatar.tsx", start: 101, end: 127, label: "Uploading a profile picture" },
        { file: "app/individual/account/components/UploadAvatar.tsx", start: 39, end: 50, label: "Turning a path into a public link" },
        { file: "app/org/index/addEvent.tsx", start: 140, end: 175, label: "Uploading an event picture when the event is saved" },
        { file: "app/org/index/editEvent/imageupload.tsx", start: 30, end: 59, label: "The earlier copy, into the profile bucket" },
      ],
      anatomy: [
        {
          kind: "table",
          caption: "The two buckets",
          columns: ["Bucket", "Holds", "File name", "Kept on the row as", "Uploaded by"],
          state: "derived",
          rows: [
            ["user_avatar", "profile pictures — plus an unused copy of every event picture", "individual_ or organization_ + the time, e.g. individual_1729….jpg", "path, in avatar_url — made into a link each time a face is drawn", "profile screens; event picture picker"],
            ["event_thumbnail", "event pictures", "the time, e.g. 1729….jpg", "full public URL, in events.thumbnail", "event form and edit form, on save"],
          ],
        },
        {
          kind: "diagram",
          caption: "One event picture, uploaded twice — and nothing ever deletes either",
          boxes: [
            { id: "pick", label: "Picture picked", sub: "event form", col: 0, row: 1 },
            { id: "av", label: "user_avatar", sub: "copy never used", col: 1, row: 0, tone: "warn" },
            { id: "save", label: "Event saved", col: 1, row: 1 },
            { id: "th", label: "event_thumbnail", sub: "the copy shown", col: 2, row: 1, tone: "good" },
            { id: "row", label: "events.thumbnail", sub: "full public link", col: 3, row: 1 },
          ],
          arrows: [
            { from: "pick", to: "av", label: "at once", tone: "warn" },
            { from: "pick", to: "save" },
            { from: "save", to: "th", label: "again" },
            { from: "th", to: "row" },
          ],
        },
        {
          kind: "sequence",
          caption: "Uploading and showing a profile picture",
          actors: ["Phone", "Storage", "Database API"],
          rows: [
            { from: "Phone", to: "Phone", label: "pick a photo, read it into memory", state: "derived" },
            { from: "Phone", to: "Storage", label: "upload to user_avatar as individual_<time>.jpg", state: "derived" },
            { from: "Phone", to: "Database API", label: "set avatar_url to that path", state: "derived" },
            { from: "Phone", to: "Storage", label: "public link for the path", note: "loads only if the bucket is public", state: "partial" },
          ],
        },
      ],
      issues: [
        {
          title: "Every event picture is uploaded twice",
          detail:
            "The picker uploads the image to `user_avatar` the moment it is chosen; saving the event uploads it again to `event_thumbnail`. The first copy is never referenced.",
          where: "app/org/index/editEvent/imageupload.tsx:44",
        },
        {
          title: "Old pictures are never removed",
          detail:
            "Replacing a picture or deleting an event leaves the old file in storage. No call in the app removes a file, so both buckets only grow.",
          where: "app/individual/account/components/UploadAvatar.tsx:117",
        },
      ],
    },
    {
      id: "sb-missing",
      title: "What The Repo Lacks",
      sub: "No migrations, an empty seed file, no access rules — the database's shape lives elsewhere",
      footprint: { dirs: ["supabase/"], files: 4 },
      state: "derived",
      col: 0,
      row: 3,
      detail: "`supabase/` holds only what `supabase init` creates, plus two edge functions. The tables, access rules and buckets were made by hand in the hosted project and never exported.",
      code: [
        { file: "supabase/config.toml", start: 1, end: 16, label: "Local development settings" },
        { file: "supabase/functions/archive-event/index.ts", start: 1, end: 20, label: "archive-event: still the starter template" },
        { file: "app/org/account/index.tsx", start: 142, end: 147, label: "Calling a function that is not in the repo" },
      ],
      anatomy: [
        {
          kind: "table",
          caption: "Expected under supabase/, and what is there",
          columns: ["Expected", "Found"],
          state: "derived",
          rows: [
            ["migrations/ — table definitions", "none"],
            ["access rules (RLS policies)", "none"],
            ["storage bucket settings", "none"],
            ["seed.sql — starting data", "present, 0 bytes"],
            ["config.toml", "local development only (ports, local auth settings)"],
            ["functions/delete-user", "present — deletes the caller's student row and Auth user"],
            ["functions/archive-event", "present — the unchanged \"Hello\" template, called by nothing"],
            ["functions/delete-organization", "missing, but the organisation account screen calls it"],
          ],
        },
      ],
      issues: [
        {
          title: "The missing rules are the whole security model",
          detail:
            "The phone talks to the database directly with a key anyone can extract from the app, so the access rules are all that protects the data — and the app's own queries show they must be quite open for it to work (see Access Rules Needed).",
          where: "supabase/",
        },
        {
          title: "The organisation delete calls a missing function",
          detail:
            "Deleting an organisation account invokes `delete-organization`, which is not in this repo. Unless it was deployed by hand, the call fails.",
          where: "app/org/account/index.tsx:142",
        },
      ],
      children: [
        {
          id: "sb-rls",
          title: "Access Rules Needed",
          sub: "What the app's own queries require the missing rules to allow",
          footprint: { dirs: ["app/", "lib/localStorage.ts"], files: 8 },
          state: "inferred",
          unsure:
            "The rules themselves are not in the repo. Each row is worked backwards from a query the app makes: if the rules forbade it, that feature could not work.",
          col: 0,
          row: 0,
          detail: "Each row below is a query the app makes, and what the missing access rules must therefore allow. The riskiest: joining means students may update events rows they don't own.",
          code: [
            { file: "app/individual/index/components/rsvpDrawer.tsx", start: 166, end: 170, label: "A student updating an event row" },
            { file: "lib/localStorage.ts", start: 49, end: 54, label: "Students reading every column of events" },
            { file: "app/(auth)/resetPassword.tsx", start: 35, end: 70, label: "Looking accounts up by email before signing in" },
            { file: "app/individual/index/eventdetails.tsx", start: 156, end: 159, label: "Students reading other students' pictures" },
            { file: "supabase/functions/delete-user/index.ts", start: 15, end: 29, label: "The delete function checks who is calling" },
          ],
          anatomy: [
            {
              kind: "table",
              caption: "What the rules must allow, query by query — the minimum the working app implies, since none of the rules can be read here",
              columns: ["The app does", "So the rules must let", "Where"],
              state: "partial",
              rows: [
                ["a student joins or cancels", "a student update an organisation's event row", "rsvpDrawer.tsx:168, joinButton.tsx:49"],
                ["Home downloads events", "any student read every column of published events, guest lists included", "localStorage.ts:51"],
                ["guest-list faces", "students read other students' id and avatar_url", "eventdetails.tsx:158"],
                ["the event page", "students read an organisation's whole row", "eventdetails.tsx:182"],
                ["password reset checks the email", "someone not signed in look up individual and organizations by email", "resetPassword.tsx:38"],
                ["password reset saves the password", "update an organisation row matched by email", "resetPassword.tsx:161"],
                ["an organisation checks people in", "an organisation update rsvp on its events", "org/index/attendees.tsx:104"],
                ["deleting a student account", "nothing — the function's service-role key skips the rules; it is safe only because it reads the caller's login token first and deletes that account alone", "delete-user/index.ts:17"],
              ],
            },
          ],
          issues: [
            {
              title: "Students can probably edit any event",
              detail:
                "Joining requires students to update `events` rows they don't own. Row rules cannot restrict which columns change, so unless a trigger or column grant (neither in the repo) limits it, a student could change any event's name, date or published flag.",
              where: "app/individual/index/components/rsvpDrawer.tsx:166",
            },
          ],
        },
      ],
    },
  ],
};
