import type { Node } from "@/lib/data";
/* ═══ 9. SERVER CODE ══════════════════════════════════════════
   Off the path: the only code that does not run on the phone. One function
   does real work; one the app calls is missing; two are leftovers. */
export const server: Node = {
  id: "server",
  title: "Server Code",
  sub: "The little code that runs off the phone: Supabase functions and a Python app",
  footprint: {
    dirs: ["supabase/functions/", "api/"],
    files: 5,
  },
  group: { ordering: "set", note: "Separate pieces; none calls another." },
  shape: { kind: "marks", ids: ["deno", "flask"], note: "Supabase edge functions run on Deno; the Python app uses Flask" },
  state: "partial",
  unsure:
    "The app also calls a function named delete-organization whose code is not in this repository. It may have been deployed to Supabase from somewhere else, or may not exist.",
  col: 1,
  row: 2,
  detail: "Almost all of explorify runs on the phone and talks straight to Supabase. Only one server function does real work, deleting a student's account; one the app calls is missing and two are leftovers.",
  code: [
    { file: "supabase/functions/delete-user/index.ts", start: 1, end: 60, label: "delete-user, the one working function" },
    { file: "app/individual/account/index.tsx", start: 125, end: 130, label: "The student's Delete Account calls it" },
    { file: "app/org/account/index.tsx", start: 142, end: 147, label: "The organisation's Delete calls a function not in the repo" },
    { file: "supabase/functions/archive-event/index.ts", start: 8, end: 20, label: "archive-event, the untouched template" },
    { file: "api/app.py", start: 1, end: 20, label: "The whole Python app" },
  ],
  anatomy: [
    {
      kind: "diagram",
      caption: "Who calls what — and what nothing calls",
      boxes: [
        { id: "student", label: "Student account", sub: "Delete Account", col: 0, row: 0 },
        { id: "org", label: "Organisation account", sub: "Delete Organization", col: 0, row: 1 },
        { id: "deluser", label: "delete-user", sub: "edge function, on Supabase's servers", col: 1, row: 0 },
        { id: "delorg", label: "delete-organization", sub: "not in this repo", col: 1, row: 1, tone: "warn" },
        { id: "archive", label: "archive-event", sub: "template, never called", col: 1, row: 3, tone: "warn" },
        { id: "python", label: "Python app", sub: "\"Hello World\", never called", col: 1, row: 4, tone: "warn" },
        { id: "profile", label: "Student profile", sub: "individual row", col: 2, row: 0 },
        { id: "login", label: "Login", sub: "Supabase Auth user", col: 2, row: 1 },
      ],
      arrows: [
        { from: "student", to: "deluser", label: "sign-in token" },
        { from: "org", to: "delorg", tone: "warn" },
        { from: "deluser", to: "profile", label: "deletes" },
        { from: "deluser", to: "login", label: "deletes" },
      ],
    },
    {
      kind: "table",
      caption: "Everything in the repo that is not phone code",
      columns: ["Piece", "Where", "Runs on", "Called by", "Does"],
      state: "partial",
      rows: [
        ["delete-user", "supabase/functions/delete-user", "Supabase (Deno)", "Student's Delete Account", "Deletes the caller's own profile and login — on a server because that needs the service-role key, which can do anything and must never be on a phone"],
        ["delete-organization", "not in the repo", "unknown", "Organisation's Delete", "unknown"],
        ["archive-event", "supabase/functions/archive-event", "Supabase (Deno)", "nothing", "Replies \"Hello <name>!\" — the unedited example `supabase functions new` generates"],
        ["CORS headers", "supabase/functions/_shared/cors.ts", "—", "nothing imports it", "A shared header list, unused"],
        ["Python app", "api/app.py", "Flask, someone's machine", "nothing", "Replies \"Hello World\""],
      ],
    },
  ],
  children: [
    {
      id: "sv-delete",
      title: "Account Deletion Function",
      sub: "Deletes the calling student's profile and login with the all-powerful service key",
      footprint: { dirs: ["supabase/functions/delete-user/index.ts"], files: 1 },
      group: { ordering: "sequence" },
      state: "derived",
      col: 0,
      row: 0,
      detail: "Deletes the calling student's profile row and login with the service key, which skips every access rule. Whose account goes is worked out from the sign-in token, never from the request body.",
      code: [
        { file: "supabase/functions/delete-user/index.ts", start: 6, end: 13, label: "The admin client" },
        { file: "supabase/functions/delete-user/index.ts", start: 15, end: 29, label: "Who is calling: the token, not the body" },
        { file: "supabase/functions/delete-user/index.ts", start: 31, end: 47, label: "Delete the profile row, then the login" },
        { file: "supabase/functions/delete-user/index.ts", start: 49, end: 59, label: "Success and error replies" },
        { file: "app/individual/account/index.tsx", start: 111, end: 150, label: "The phone's side: call, sign out, clear storage" },
      ],
      anatomy: [
        {
          kind: "sequence",
          caption: "One account deletion",
          actors: ["Phone", "delete-user", "Auth", "Database"],
          rows: [
            { from: "Phone", to: "delete-user", label: "POST /functions/v1/delete-user, with the sign-in token", note: "after an \"are you sure\" alert; sent as invoke(\"delete-user\", { body: { userId } }), and the body's userId is no longer read", state: "derived" },
            { from: "delete-user", to: "Auth", label: "whose token is this?", state: "derived" },
            { from: "Auth", to: "delete-user", label: "the user — or nothing, and the reply is 401", state: "derived" },
            { from: "delete-user", to: "Database", label: "delete from individual where id = that user", note: "service key: no access rules apply", state: "derived" },
            { from: "delete-user", to: "Auth", label: "delete that user's login", state: "derived" },
            { from: "delete-user", to: "Phone", label: "200 { \"success\": true }", note: "the phone signs out, wipes its local storage and returns to the start screen", state: "derived" },
          ],
        },
        {
          kind: "routes",
          rows: [
            { method: "POST", path: "/functions/v1/delete-user", auth: "Caller's sign-in token, checked by the function", state: "derived", note: "deletes the caller; the body is ignored" },
          ],
        },
        {
          kind: "table",
          caption: "Replies",
          columns: ["When", "Status", "Body"],
          state: "derived",
          rows: [
            ["Profile and login deleted", "200", "{ \"success\": true }"],
            ["No token, or not a user's token", "401", "{ \"error\": \"Unauthorized\" }"],
            ["Database or Auth refuses", "400", "{ \"error\": \"<its message>\" }"],
          ],
        },
        {
          kind: "flow",
          rows: [
            { n: 1, title: "Admin client", detail: "Built from SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the function's environment. That key skips every database access rule, so the function's own check is the only one.", state: "derived" },
            { n: 2, title: "Find out who is calling", detail: "The token from the Authorization header is looked up with Auth; no token, or no user behind it, and the reply is 401.", state: "derived" },
            { n: 3, title: "Delete the profile", detail: "From individual only — never from organizations.", state: "derived" },
            { n: 4, title: "Delete the login", detail: "auth.admin.deleteUser on the caller's id.", state: "derived" },
          ],
        },
        {
          kind: "table",
          caption: "The check is new",
          columns: ["Version", "Whose account it deletes", "Who could delete"],
          state: "derived",
          rows: [
            ["Before commit 304a512 — including the mapped commit, 59a89b3", "Whichever userId the body names", "Anyone holding the app's public key, any account"],
            ["304a512 and later", "The caller, from the sign-in token", "A student, only themselves"],
          ],
        },
      ],
      issues: [
        {
          title: "Deleted students stay on guest lists",
          detail:
            "Only the profile and login are removed. The student's name and email remain in the `rsvp` text of every event they joined, and their missing profile makes the organiser's Attendees screen crash on that row.",
          where: "supabase/functions/delete-user/index.ts:32",
        },
      ],
    },
    {
      id: "sv-delorg",
      title: "Missing Organisation Delete",
      sub: "A function the organisation's Delete button calls that is not in the repo",
      footprint: { dirs: ["app/org/account/index.tsx"], files: 1 },
      state: "inferred",
      unsure:
        "Only the call is in the repository. Whether delete-organization exists on the Supabase project, and what it deletes, cannot be told from here.",
      col: 0,
      row: 1,
      detail: "The organisation's Delete button calls a server function, delete-organization, whose code is not in this repository. supabase/functions/ holds only delete-user and archive-event.",
      code: [
        { file: "app/org/account/index.tsx", start: 129, end: 168, label: "The call, and what the phone does after" },
      ],
      anatomy: [
        {
          kind: "sequence",
          caption: "The call",
          actors: ["Phone", "delete-organization"],
          rows: [
            { from: "Phone", to: "delete-organization", label: "invoke(\"delete-organization\", { body: { userId } }), with its own id", note: "the same shape as the student's call", state: "derived" },
            { from: "delete-organization", to: "Phone", label: "unknown — no code to read", state: "inferred" },
          ],
        },
        {
          kind: "table",
          caption: "The two possibilities",
          columns: ["If the function…", "What happens"],
          state: "inferred",
          rows: [
            ["was never deployed", "The call fails and the organisation sees \"There was an error deleting your organization. Please try again.\" every time"],
            ["was deployed from somewhere else", "Its code — and whether it trusts the body's id the way delete-user used to — cannot be reviewed here"],
          ],
        },
      ],
      issues: [
        {
          title: "Organisation deletion is not in the repo",
          detail:
            "The Delete button depends on a server function nobody can read here. Either organisations can never delete themselves, or the code that deletes them — with the all-powerful service key — is unreviewed and could trust the `userId` in the body.",
          where: "app/org/account/index.tsx:142",
        },
      ],
    },
    {
      id: "sv-archive",
      title: "Unused Archive Function",
      sub: "Supabase's generated hello-world example, never edited and never called",
      footprint: { dirs: ["supabase/functions/archive-event/index.ts"], files: 1 },
      state: "derived",
      col: 0,
      row: 2,
      detail: "Despite its name it archives nothing: it is the unedited hello-world example Supabase generates for a new function. No code calls it.",
      code: [
        { file: "supabase/functions/archive-event/index.ts", start: 8, end: 20, label: "The whole function" },
        { file: "supabase/functions/archive-event/index.ts", start: 22, end: 31, label: "The generated how-to-call comment" },
        { file: "app/org/index/components/archive.tsx", start: 51, end: 55, label: "Where archiving really happens: a date check on the phone" },
      ],
      anatomy: [
        {
          kind: "example",
          caption: "Its only behaviour",
          value: `request:  POST /functions/v1/archive-event   { "name": "Functions" }
reply:    200   { "message": "Hello Functions!" }`,
          notes: [
            { label: "generated by", value: "supabase functions new archive-event — its setup comments and sample curl command are still in the file", state: "derived" },
          ],
        },
        {
          kind: "table",
          caption: "Where archiving really happens",
          columns: ["Place", "What it does"],
          state: "derived",
          rows: [
            ["archive-event function", "Nothing — never called"],
            ["Organisation's Archive list, on the phone", "Shows published events dated before today"],
          ],
        },
      ],
      issues: [
        {
          title: "A function named for a job it does not do",
          detail:
            "Anyone reading the folder will expect events to be archived on a server. If archiving should become a real stored state, this is the obvious place for it; otherwise the folder can be deleted.",
          where: "supabase/functions/archive-event/index.ts:8",
        },
      ],
    },
    {
      id: "sv-flask",
      title: "Unused Python Server",
      sub: "A Flask app with one address that replies Hello World",
      footprint: { dirs: ["api/app.py", "api/requirements.txt"], files: 2 },
      state: "derived",
      col: 0,
      row: 3,
      detail: "A twenty-line Flask app whose one address replies Hello World. Nothing in explorify sends it a request, and as committed it would not start cleanly.",
      code: [
        { file: "api/app.py", start: 1, end: 2, label: "How it was meant to be run" },
        { file: "api/app.py", start: 4, end: 17, label: "The app and its one route" },
        { file: "api/app.py", start: 19, end: 20, label: "A host written with commas" },
        { file: "api/requirements.txt", start: 1, end: 12, label: "Dependencies — no Flask-Cors" },
        { file: "package.json", start: 5, end: 5, label: "A proxy setting pointing at port 5000" },
      ],
      anatomy: [
        {
          kind: "routes",
          rows: [
            { method: "GET", path: "/", auth: "none — open to requests from any website", state: "derived", note: "replies \"Hello World\"" },
          ],
        },
        {
          kind: "table",
          caption: "Why it would not run as committed",
          columns: ["Line", "Says", "Problem"],
          state: "derived",
          rows: [
            ["app.py:2", "flask run --host=10.193.207.116 --port=8082", "Port disagrees with line 20"],
            ["app.py:5", "from flask_cors import CORS", "Flask-Cors is not in requirements.txt, so a fresh install fails here"],
            ["app.py:20", "host='10,193,207,116', port='8081'", "Commas instead of dots: not an address"],
            ["package.json:5", "\"proxy\": \"http://127.0.0.1:5000\"", "A setting from web projects that Expo is not known to use"],
          ],
        },
        {
          kind: "table",
          caption: "What the file holds",
          columns: ["Piece", "Used?"],
          state: "derived",
          rows: [
            ["A Flask app", "Yes, it answers GET / with \"Hello World\""],
            ["CORS for every website", "Yes, any website may call it"],
            ["A database handle (SQLAlchemy, \"explorify_db\")", "Never"],
            ["Callers in the phone app", "None — the phone's only web calls go to Supabase and Google"],
            ["Why it exists", "Most likely from before the project moved to Supabase; the repository does not say"],
          ],
        },
      ],
    },
  ],
};
