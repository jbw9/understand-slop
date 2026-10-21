import type { Node } from "@/lib/data";
/* ═══ 9. SERVER CODE ══════════════════════════════════════════
   Off the path. Five levels: server code → delete-user → who may call it →
   the trust decision → the source. */
export const server: Node = {
  id: "server",
  title: "Server Code",
  sub: "Two edge functions and a Python API — one does real work, two are templates",
  footprint: {
    dirs: ["supabase/functions/", "api/"],
    files: 5,
  },
  group: { ordering: "set", note: "Everything in the repo that does not run on the phone." },
  shape: { kind: "marks", ids: ["deno", "flask"], note: "Supabase edge functions on Deno; a Flask app in api/" },
  state: "partial",
  alarm: true,
  col: 1,
  row: 2,
  detail:
    "Only delete-user does anything, and it deletes whichever user id it is sent. archive-event is Supabase's hello-world, and the Flask API answers \"Hello World\" with nothing calling it.",
  evidence: "supabase/functions/, api/app.py",
  children: [
    {
      id: "sv-delete",
      title: "delete-user",
      sub: "Deletes a profile and its auth user with the service-role key",
      footprint: { dirs: ["supabase/functions/delete-user/index.ts"], files: 1 },
      group: { ordering: "sequence" },
      state: "partial",
      alarm: true,
      col: 0,
      row: 0,
      detail:
        "The service-role key bypasses every policy, so this function's own checks are the only checks — and it has one: that userId is present.",
      evidence: "supabase/functions/delete-user/index.ts:15",
      anatomy: [
        {
          kind: "flow",
          rows: [
            { n: 1, title: "Admin client", detail: "Built from SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the function's environment.", state: "derived" },
            {
              n: 2,
              title: "Take the id",
              detail: "Read from the JSON body, not from the caller's token.",
              state: "partial",
              under: [
                {
                  kind: "map",
                  caption: "who decides which account is deleted",
                  rows: [
                    {
                      from: "the request body",
                      to: "any userId the caller writes — never compared with who is calling",
                      state: "derived",
                      under: [
                        {
                          kind: "source",
                          file: "supabase/functions/delete-user/index.ts",
                          start: 6,
                          code: `serve(async (req) => {
  try {
    // Use the service role key here
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { userId } = await req.json();

    if (!userId) {
      throw new Error("userId is required");
    }`,
                          why: "The Authorization header is never read. Any signed-in user can delete any other user by sending their id — and user ids are in every event's rsvp string, which every student downloads.",
                        },
                      ],
                    },
                    { from: "the gateway", to: "Supabase's default JWT check — which the public anon key itself passes", state: "inferred" },
                  ],
                },
              ],
            },
            { n: 3, title: "Delete profile", detail: "From individual only. Sent an organisation's id, it deletes the auth user and leaves the organizations row behind.", state: "derived" },
            { n: 4, title: "Delete auth user", detail: "auth.admin.deleteUser(userId).", state: "derived" },
          ],
        },
      ],
    },
    {
      id: "sv-archive",
      title: "archive-event",
      sub: "The Supabase hello-world template, unchanged and uncalled",
      footprint: { dirs: ["supabase/functions/archive-event/index.ts"], files: 1 },
      state: "derived",
      col: 0,
      row: 1,
      detail:
        "Its name suggests it moves past events to an archive. The dashboard's Archive tab does that with a date filter instead, and no code invokes this function.",
      evidence: "supabase/functions/archive-event/index.ts:10",
      anatomy: [
        {
          kind: "map",
          caption: "what it does",
          rows: [
            {
              from: "{ name }",
              to: "{ message: \"Hello name!\" }",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "supabase/functions/archive-event/index.ts",
                  start: 8,
                  code: `console.log("Hello from Functions!")

Deno.serve(async (req) => {
  const { name } = await req.json()
  const data = {
    message: \`Hello \${name}!\`,
  }

  return new Response(
    JSON.stringify(data),
    { headers: { "Content-Type": "application/json" } },
  )
})`,
                  why: "Generated by `supabase functions new` and never edited. Safe to delete, or the place to move archiving if it should be a real state.",
                },
              ],
            },
            { from: "callers", to: "none — supabase.functions.invoke names only delete-user and delete-organization", state: "derived" },
          ],
        },
      ],
    },
    {
      id: "sv-flask",
      title: "Python API",
      sub: "A Flask app with one route that returns Hello World",
      footprint: { dirs: ["api/app.py", "api/requirements.txt"], files: 2 },
      state: "derived",
      col: 0,
      row: 2,
      detail:
        "Nothing in the app calls it. Most likely an early backend that Supabase replaced — the repo does not say.",
      evidence: "api/app.py:15",
      anatomy: [
        {
          kind: "map",
          caption: "what is wrong with it, if it were used",
          rows: [
            {
              from: "app.py",
              to: "one route, an unused database handle, and a host that cannot parse",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "api/app.py",
                  start: 1,
                  code: `# source venv/bin/activate
# flask run --host=10.193.207.116 --port=8082 --debug

from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
db_name = "explorify_db"

app = Flask(__name__)

CORS(app, resources={r'/*': {'origins': '*'}})

@app.route('/')
def hello_world():
    return "Hello World"

if __name__ == "__main__":
    app.run(debug=True, host='10,193,207,116', port='8081')`,
                  why: "The host uses commas where dots belong, and the comment's port (8082) disagrees with the code's (8081). flask_cors is imported but missing from requirements.txt, so a fresh install fails on line 5.",
                },
              ],
            },
            { from: "callers", to: "none — the only HTTP calls in the app go to Supabase and Google", state: "derived" },
            { from: "package.json \"proxy\"", to: "points at port 5000 — a Create React App setting Expo is not known to read", state: "inferred" },
          ],
        },
      ],
    },
  ],
};
