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
  detail: `Almost everything in this app runs on the phone and talks straight to Supabase. The exceptions live in \`supabase/functions/\` (small TypeScript programs Supabase runs on its servers, called "edge functions") and in \`api/\` (a Python web app).

Only one of them does real work: \`delete-user\`, which the student's Delete Account button calls. It needs to run on a server because deleting a login requires Supabase's service-role key, which can do anything and must never be on a phone. It works out whose account to delete from the caller's sign-in token, so a student can only delete themselves. The organisation's Delete button calls a second function, \`delete-organization\`, which is not in the repository.

The other two are leftovers. \`archive-event\` is the "Hello" example that \`supabase functions new\` generates, never edited and never called. The Python app answers "Hello World" on one address and nothing in the app talks to it.`,
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
        { id: "deluser", label: "delete-user", sub: "edge function", col: 1, row: 0 },
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
        ["delete-user", "supabase/functions/delete-user", "Supabase (Deno)", "Student's Delete Account", "Deletes the caller's own profile and login"],
        ["delete-organization", "not in the repo", "unknown", "Organisation's Delete", "unknown"],
        ["archive-event", "supabase/functions/archive-event", "Supabase (Deno)", "nothing", "Replies \"Hello <name>!\""],
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
      detail: `The student's Delete Account button (after an "are you sure" alert) calls \`supabase.functions.invoke("delete-user", { body: { userId } })\`. The Supabase library sends the student's sign-in token along with it. On success the phone signs out, wipes its local storage and returns to the start screen.

Inside, the function builds an admin client from \`SUPABASE_SERVICE_ROLE_KEY\`, a key that skips every database access rule — so the function's own check is the only one. It reads the token from the \`Authorization\` header and asks Supabase Auth whose it is. No token, or one that belongs to no user, gets a 401. Otherwise it deletes the \`individual\` row and then the login of that user. The \`userId\` in the body is ignored.

That check is new: until commit \`304a512\` the function deleted whichever \`userId\` the body named, so anyone holding the app's public key could delete any account. The mapped commit, \`59a89b3\`, still has that version.`,
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
            { from: "Phone", to: "delete-user", label: "POST /functions/v1/delete-user, with the sign-in token", note: "the body's userId is no longer read", state: "derived" },
            { from: "delete-user", to: "Auth", label: "whose token is this?", state: "derived" },
            { from: "Auth", to: "delete-user", label: "the user — or nothing, and the reply is 401", state: "derived" },
            { from: "delete-user", to: "Database", label: "delete from individual where id = that user", note: "service key: no access rules apply", state: "derived" },
            { from: "delete-user", to: "Auth", label: "delete that user's login", state: "derived" },
            { from: "delete-user", to: "Phone", label: "200 { \"success\": true }", state: "derived" },
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
            { n: 1, title: "Admin client", detail: "Built from SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the function's environment.", state: "derived" },
            { n: 2, title: "Find out who is calling", detail: "The Authorization token is looked up with Auth; without a user behind it the reply is 401.", state: "derived" },
            { n: 3, title: "Delete the profile", detail: "From individual only — never from organizations.", state: "derived" },
            { n: 4, title: "Delete the login", detail: "auth.admin.deleteUser on the caller's id.", state: "derived" },
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
      detail: `The organisation's account screen calls \`supabase.functions.invoke("delete-organization", { body: { userId } })\` with its own id — the same shape as the student's call. \`supabase/functions/\` holds only \`delete-user\` and \`archive-event\`.

If the function was never deployed, the call fails and the organisation sees "There was an error deleting your organization. Please try again." every time. If it was deployed from somewhere else, its code — and whether it trusts the body's id the way \`delete-user\` used to — cannot be reviewed here.`,
      code: [
        { file: "app/org/account/index.tsx", start: 129, end: 168, label: "The call, and what the phone does after" },
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
      detail: `The name suggests it moves finished events into an archive. It does not: it is exactly what \`supabase functions new archive-event\` generates — it reads a \`name\` from the request and replies with a greeting. The setup comments and the sample curl command are still in the file.

No code calls it. The organisation's Archive list does the archiving on the phone instead, by showing published events dated before today. If archiving should become a real stored state, this is the obvious place for it; otherwise the folder can be deleted.`,
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
      detail: `\`api/app.py\` is twenty lines: it creates a Flask app, allows requests from any website, sets up a database handle it never uses, and answers \`GET /\` with "Hello World". Nothing in the app sends it a request — the only web calls the phone makes go to Supabase and Google.

It most likely dates from before the project moved to Supabase; the repository does not say. As written it would not start cleanly: the host in \`app.run\` uses commas where the dots of an IP address belong, the comment at the top gives a different port from the code, and \`flask_cors\` is imported but missing from \`requirements.txt\`.

\`package.json\` also has a \`proxy\` entry pointing at port 5000, a setting from web projects that Expo is not known to use.`,
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
          ],
        },
      ],
    },
  ],
};
