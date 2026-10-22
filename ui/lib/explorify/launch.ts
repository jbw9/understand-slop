import type { Node } from "@/lib/data";
/* ═══ 2. OPENING THE APP ═══════════════════════════════════════
   How the app decides student or organisation: the launch check, the login
   screen's version of it, the copies that run at once, and the values it
   leaves on the phone for every later screen. */
export const launch: Node = {
  id: "launch",
  title: "Opening The App",
  sub: "Each time the app opens it works out whether you are a student or an organisation and shows the right home screen.",
  footprint: {
    dirs: ["app/_layout.tsx", "app/index.tsx", "app/(auth)/login.tsx", "lib/localStorage.ts"],
    files: 4,
  },
  shape: { kind: "figure", id: "role-by-table", note: "There is no role column; the table that has your id decides" },
  state: "derived",
  col: 0,
  row: 1,
  detail: "There is no role field: you are a student if `individual` has a row with your account id, an organisation if `organizations` does. The check runs twice at once on every launch, and again after logging in.",
  code: [
    { file: "app/_layout.tsx", start: 46, end: 90, label: "The launch check in the root layout" },
    { file: "app/index.tsx", start: 18, end: 74, label: "The same check again on the first screen" },
    { file: "app/(auth)/login.tsx", start: 62, end: 112, label: "And again after logging in" },
  ],
  anatomy: [
    {
      kind: "diagram",
      caption: "The launch check: the first table holding your id decides which home opens, and the profile is then copied onto the phone",
      boxes: [
        { id: "open", label: "App opens", sub: "root layout + first screen", col: 0, row: 1, opens: "ln-copies" },
        { id: "auth", label: "Supabase Auth", sub: "who is signed in?", col: 1, row: 1, opens: "ln-lookup" },
        { id: "ind", label: "individual table", sub: "a row with this id?", col: 2, row: 0, opens: "ln-lookup" },
        { id: "org", label: "organizations table", sub: "a row with this id?", col: 2, row: 1, opens: "ln-lookup" },
        { id: "login", label: "Login screen", sub: "no one signed in", col: 2, row: 2, opens: "ln-login" },
        { id: "shome", label: "Student home", sub: "Saved · Home · Account", col: 3, row: 0, tone: "good" },
        { id: "ohome", label: "Organisation home", sub: "Other Events · Home · Account", col: 3, row: 1, tone: "good" },
        { id: "stuck", label: "Nowhere", sub: "in neither table", col: 3, row: 2, tone: "warn" },
        { id: "phone", label: "Phone storage", sub: "uuid, then user", col: 4, row: 1, opens: "ln-cache" },
      ],
      arrows: [
        { from: "open", to: "auth" },
        { from: "auth", to: "ind", label: "signed in" },
        { from: "auth", to: "login", label: "not signed in" },
        { from: "ind", to: "shome", label: "found", tone: "good" },
        { from: "ind", to: "org", label: "no row" },
        { from: "org", to: "ohome", label: "found", tone: "good" },
        { from: "org", to: "stuck", label: "no row", tone: "warn" },
        { from: "shome", to: "phone", label: "profile copied" },
        { from: "ohome", to: "phone", label: "profile copied" },
      ],
    },
    {
      kind: "table",
      caption: "Where you end up",
      columns: ["Signed in?", "Row in individual?", "Row in organizations?", "Opens"],
      state: "derived",
      rows: [
        ["No", "—", "—", "Login screen"],
        ["Yes", "Yes", "not asked", "Student home (tabs: Saved, Home, Account)"],
        ["Yes", "No", "Yes", "Organisation home (tabs: Other Events, Home, Account)"],
        ["Yes", "No", "No", "Nothing — stays on the opening screen (e.g. a sign-up abandoned after the code)"],
      ],
    },
    {
      kind: "table",
      caption: "Who runs the check",
      columns: ["File", "What it is", "Runs the check"],
      state: "derived",
      rows: [
        ["app/_layout.tsx", "wraps every screen", "on every launch"],
        ["app/index.tsx", "the first screen", "on every launch, at the same time"],
        ["app/(auth)/login.tsx", "the login screen", "after a password sign-in"],
      ],
    },
  ],
  children: [
    {
      id: "ln-lookup",
      title: "Checking Who You Are",
      sub: "The launch check in the root layout: ask who is signed in, then look in each profile table.",
      footprint: { dirs: ["app/_layout.tsx"], files: 1 },
      shape: { kind: "marks", ids: ["expo", "supabase"], note: "Expo Router opens the screen; Supabase answers the lookup" },
      state: "derived",
      col: 0,
      row: 0,
      detail: "`checkUser` in the root layout runs once at start-up: ask Supabase who is signed in, then look for that id in `individual`, then in `organizations`. The first table with a row decides which home opens.",
      code: [
        { file: "app/_layout.tsx", start: 46, end: 53, label: "Ask who is signed in, save the id" },
        { file: "app/_layout.tsx", start: 54, end: 65, label: "Student? Look in individual" },
        { file: "app/_layout.tsx", start: 66, end: 79, label: "Organisation? Look in organizations" },
        { file: "app/_layout.tsx", start: 80, end: 89, label: "Not signed in, or an error: login" },
      ],
      anatomy: [
        {
          kind: "flow",
          rows: [
            { n: 1, title: "Who is signed in", detail: "`getUser()` asks Supabase Auth to confirm the session saved on the phone; the id is saved as `uuid` without waiting.", state: "derived" },
            { n: 2, title: "Student?", detail: "A row in `individual` with this id → `/individual`, then the profile is copied in the background. Checked first, so an id in both tables is always a student.", state: "derived" },
            { n: 3, title: "Organisation?", detail: "Otherwise a row in `organizations` → `/org`, then the profile is copied in the background.", state: "derived" },
            { n: 4, title: "Neither", detail: "Signed in, in neither table: no branch handles it, so nothing happens.", state: "derived" },
            { n: 5, title: "Not signed in", detail: "→ `/login`. An unexpected error also ends here.", state: "derived" },
          ],
        },
        {
          kind: "sequence",
          caption: "An organisation opening the app",
          actors: ["Phone", "Supabase Auth", "individual", "organizations"],
          rows: [
            { from: "Phone", to: "Supabase Auth", label: "who is signed in?", state: "derived" },
            { from: "Supabase Auth", to: "Phone", label: "the account", state: "derived" },
            { from: "Phone", to: "Phone", label: "save the id as \"uuid\"", state: "derived" },
            { from: "Phone", to: "individual", label: "a row with this id?", state: "derived" },
            { from: "individual", to: "Phone", label: "none", state: "derived" },
            { from: "Phone", to: "organizations", label: "a row with this id?", state: "derived" },
            { from: "organizations", to: "Phone", label: "one row", state: "derived" },
            { from: "Phone", to: "Phone", label: "open /org, copy the profile", state: "derived" },
          ],
        },
      ],
      issues: [
        {
          title: "No way forward without a profile",
          detail:
            "The `else` only covers \"not signed in\". A signed-in user with no profile row falls through both checks and is left on the opening screen, which has nothing to tap. This is exactly the state an abandoned sign-up leaves behind.",
          where: "app/_layout.tsx:80",
        },
        {
          title: "Failed lookups look like missing rows",
          detail:
            "Neither table query checks its error (the logging is commented out). A network or permission failure on `individual` quietly falls through to the organisation check, and then to nothing.",
          where: "app/_layout.tsx:63",
        },
        {
          title: "Home can open before its profile",
          detail:
            "The `uuid` save is not waited for, and the profile copy starts only after the home screen is opened. So a home screen can appear before `user` is on the phone, which is why several screens wait and retry (see Saved On The Phone).",
          where: "app/_layout.tsx:59",
        },
      ],
    },
    {
      id: "ln-login",
      title: "Logging In",
      sub: "The login screen signs in with email and password, then runs its own student-or-organisation check.",
      footprint: { dirs: ["app/(auth)/login.tsx"], files: 1 },
      state: "derived",
      col: 0,
      row: 1,
      detail: "Signs in with email and password, then runs a third copy of the launch check and opens the right home. A correct password for a login with no profile shows a raw database error instead of the intended message.",
      code: [
        { file: "app/(auth)/login.tsx", start: 39, end: 60, label: "Sign in and save the id" },
        { file: "app/(auth)/login.tsx", start: 62, end: 86, label: "Student check: \"no rows\" is allowed" },
        { file: "app/(auth)/login.tsx", start: 88, end: 114, label: "Organisation check: \"no rows\" is thrown" },
        { file: "app/(auth)/login.tsx", start: 23, end: 30, label: "Token refresh follows the app to the foreground" },
        { file: "app/(auth)/login.tsx", start: 152, end: 235, label: "What the login screen shows" },
      ],
      anatomy: [
        {
          kind: "screen",
          title: "Login",
          caption: "The login screen, as someone signed out first sees it",
          shot: "/shots/explorify/ln-login.png",
          items: [
            { type: "heading", label: "Welcome back!" },
            { type: "field", label: "✉️ Email", note: "email keyboard, no auto-capitals; trimmed before sending" },
            { type: "field", label: "🔑 Password", note: "hidden; the eye icon shows it" },
            { type: "text", label: "Forgot password", note: "opens Resetting A Password" },
            { type: "button", label: "Login", note: "blue even when empty; alerts \"Please enter both email and password\" if either is missing" },
            { type: "text", label: "Don't have an account? Sign Up", note: "asks Organization or Individual, then opens that sign-up" },
          ],
        },
        {
          kind: "sequence",
          caption: "A student logging in",
          actors: ["Phone", "Supabase Auth", "individual", "organizations"],
          rows: [
            { from: "Phone", to: "Supabase Auth", label: "email + password", state: "derived" },
            { from: "Supabase Auth", to: "Phone", label: "a session", state: "derived" },
            { from: "Phone", to: "Phone", label: "save the id as \"uuid\"", state: "derived" },
            { from: "Phone", to: "individual", label: "exactly one row?", state: "derived" },
            { from: "individual", to: "Phone", label: "the row", state: "derived" },
            { from: "Phone", to: "Phone", label: "cache as \"user\", open /individual", state: "derived" },
          ],
        },
        {
          kind: "facts",
          rows: [
            { label: "Unlike launch", value: "waits for each step, and asks for exactly one row with .single(), which reports \"no rows\" as an error", state: "derived" },
            { label: "Token refresh", value: "this file switches Supabase's automatic token refresh on when the app comes to the foreground and off when it goes to the background", state: "derived" },
          ],
        },
      ],
      issues: [
        {
          title: "Wrong error for a login with no profile",
          detail:
            "The student check allows `.single()`'s \"no rows\" error; the organisation check throws it. So when neither table has the id, the person sees Supabase's raw \"no rows\" message instead of the intended \"No matching profile found\".",
          where: "app/(auth)/login.tsx:95",
        },
      ],
    },
    {
      id: "ln-copies",
      title: "Duplicate Launch Checks",
      sub: "The same check is written in three files, and two of them run at the same time on every launch.",
      footprint: { dirs: ["app/_layout.tsx", "app/index.tsx", "app/(auth)/login.tsx"], files: 3 },
      state: "derived",
      col: 0,
      row: 2,
      detail: "The root layout and the first screen each run their own `checkUser` on every launch, unaware of each other; the login screen has a third. The first screen's copy throws for every student.",
      code: [
        { file: "app/_layout.tsx", start: 46, end: 90, label: "Copy 1: the root layout" },
        { file: "app/index.tsx", start: 18, end: 74, label: "Copy 2: the first screen" },
        { file: "app/(auth)/login.tsx", start: 39, end: 124, label: "Copy 3: the login screen" },
      ],
      anatomy: [
        {
          kind: "diagram",
          caption: "Two copies run on every launch; only the root layout's routes a student. An organisation is opened twice, in whichever order the network answers.",
          boxes: [
            { id: "opens", label: "App opens", col: 0, row: 0 },
            { id: "layout", label: "Root layout check", sub: "app/_layout.tsx", col: 1, row: 0 },
            { id: "first", label: "First screen check", sub: "app/index.tsx", col: 1, row: 1 },
            { id: "shome", label: "Student home", col: 2, row: 0, tone: "good" },
            { id: "ohome", label: "Organisation home", col: 2, row: 1, tone: "good" },
            { id: "crash", label: "Push token error", sub: "token is not defined", col: 2, row: 2, tone: "warn", opens: "ln-token" },
          ],
          arrows: [
            { from: "opens", to: "layout", label: "mounts" },
            { from: "opens", to: "first", label: "mounts" },
            { from: "layout", to: "shome", label: "push" },
            { from: "layout", to: "ohome", label: "push" },
            { from: "first", to: "ohome", label: "replace" },
            { from: "first", to: "crash", label: "students", tone: "warn" },
          ],
        },
        {
          kind: "table",
          caption: "How the three copies differ",
          columns: ["Difference", "Root layout", "First screen", "Login"],
          state: "derived",
          rows: [
            ["Runs", "every launch", "every launch", "after a password sign-in"],
            ["Opens a home with", "push", "replace", "replace"],
            ["Waits for the uuid save", "no", "no", "yes"],
            ["Errors", "ignored", "logged", "shown in an alert"],
            ["Students", "routed", "throws before routing (see Missing Push Token)", "routed"],
            ["In neither table", "nothing happens", "nothing happens", "raw \"no rows\" error"],
            ["Profile copy", "started after opening the home", "started just before, not waited for", "finished before opening the home"],
          ],
        },
      ],
      issues: [
        {
          title: "The check runs twice at once",
          detail:
            "Two navigations can land on top of each other on every launch, and any fix to the routing has to be repeated in all three files or the copies drift further apart.",
          where: "app/index.tsx:18",
        },
        {
          title: "A slow start can strand a student",
          detail:
            "The root layout draws nothing until its fonts load, but its check can finish first; then `router.push` throws because no navigator is drawn yet, and the catch swallows it. Organisations are still opened by the first screen's copy, but for students that copy throws too, so they stay on a blank opening screen. Seen in the web build used for these screenshots.",
          where: "app/_layout.tsx:59",
        },
      ],
      children: [
        {
          id: "ln-token",
          title: "Missing Push Token",
          sub: "The first screen tries to save a notification token that the code no longer creates.",
          footprint: { dirs: ["app/index.tsx", "package.json"], files: 2 },
          state: "derived",
          col: 0,
          row: 0,
          detail: "For a student, `app/index.tsx` saves `token.data` as the push token before routing, but nothing anywhere declares `token`. The line throws every time, and no push token is ever saved.",
          code: [
            { file: "app/index.tsx", start: 26, end: 44, label: "The student branch that throws" },
            { file: "package.json", start: 38, end: 38, label: "expo-notifications: installed, never imported" },
          ],
          anatomy: [
            {
              kind: "flow",
              rows: [
                { n: 1, title: "Student row found", detail: "`individual` has a row with this id.", state: "derived" },
                { n: 2, title: "Save the push token", detail: "Updates `individual.expo_push_token` with `token.data`; `token` is not defined, so this throws a ReferenceError.", state: "derived" },
                { n: 3, title: "Caught and logged", detail: "\"Error checking individual\"; the check moves on to `organizations`.", state: "derived" },
                { n: 4, title: "Nothing found", detail: "No organisation row, so this copy routes nowhere. The student reaches home only because the root layout's copy already sent them.", state: "derived" },
              ],
            },
            {
              kind: "facts",
              rows: [
                { label: "expo-notifications", value: "listed in package.json, imported nowhere", state: "derived" },
                { label: "How it got here", value: "the code that once produced the token was removed and this line left behind", state: "inferred" },
              ],
            },
          ],
          issues: [
            {
              title: "Push tokens are never saved",
              detail:
                "`token` is undefined, so the update never runs and `expo_push_token` stays empty for every student. Anything built on push notifications would have no one to send to.",
              where: "app/index.tsx:35",
            },
          ],
        },
      ],
    },
    {
      id: "ln-cache",
      title: "Saved On The Phone",
      sub: "The values copied into phone storage that almost every screen reads instead of asking the database.",
      footprint: { dirs: ["lib/localStorage.ts"], files: 1 },
      state: "derived",
      col: 0,
      row: 3,
      detail: "The signed-in profile is copied into phone storage at launch, login and sign-up, and nearly every screen reads that copy instead of the database. A database change that skips the copy stays invisible until the next launch.",
      code: [
        { file: "lib/localStorage.ts", start: 5, end: 30, label: "Save and read any value as JSON" },
        { file: "lib/localStorage.ts", start: 108, end: 136, label: "Copy a student's profile onto the phone" },
        { file: "lib/localStorage.ts", start: 78, end: 106, label: "Copy an organisation's profile onto the phone" },
        { file: "lib/localStorage.ts", start: 42, end: 76, label: "Fetch and save a campus's upcoming events" },
        { file: "app/individual/index/index.tsx", start: 198, end: 221, label: "Waiting for the profile: five retries" },
      ],
      anatomy: [
        {
          kind: "table",
          caption: "What is kept on the phone",
          columns: ["Key", "Holds", "Written by", "Read by"],
          state: "derived",
          rows: [
            ["uuid", "the signed-in account id", "launch, login, sign-up stage 3", "the two profile helpers"],
            ["user", "the whole profile row from individual or organizations", "launch, login, sign-up; a student's new photo", "nearly every screen: name, photo, interests, id"],
            ["events", "upcoming published events for one campus, soonest first", "student home, Other Events, sign-up", "home feed, both search screens, Other Events"],
            ["tempPassword", "sign-up's made-up password, as plain text", "sign-up stage 2", "nothing"],
            ["(Supabase session)", "the login session", "the Supabase client itself", "the Supabase client itself"],
          ],
        },
        {
          kind: "table",
          caption: "lib/localStorage.ts: a thin layer over the phone's key-value store (AsyncStorage)",
          columns: ["Helper", "Does"],
          state: "derived",
          rows: [
            ["storeData", "saves any value as JSON under a key"],
            ["retrieveData", "reads it back"],
            ["fetchUserProfileIndividual", "fetches the student's row and saves it as user"],
            ["fetchUserProfileOrg", "the same, from organizations"],
            ["fetchAllEvents", "fetches a campus's published events from today on, soonest first, and saves them as events"],
          ],
        },
        {
          kind: "table",
          caption: "Screens that wait for the copy, because launch opens the home before it lands",
          columns: ["Screen", "If user is not there yet"],
          state: "derived",
          rows: [
            ["Student home", "looks again up to 5 times, 0.5 s apart, then gives up (about 2.5 s)"],
            ["Organisation home", "the same"],
            ["Other Events", "the same"],
            ["Organisation Account tab", "the same"],
          ],
        },
        {
          kind: "example",
          caption: "The cached \"user\" for a student (example values)",
          value: `user = {
  "id": "5f0c2a1e-…",
  "email": "sam@illinois.edu",
  "full_name": "Sam Lee",
  "interests": ["stem", "social"],
  "avatar_url": "individual_1712345678901.jpg",
  …the rest of the individual row
}`,
          notes: [
            { label: "Stored as", value: "one JSON string under the key user", state: "derived" },
            { label: "Refreshed", value: "only at launch, login and sign-up — and for students, after a new profile photo", state: "derived" },
          ],
        },
      ],
      issues: [
        {
          title: "Saved edits go stale on the phone",
          detail:
            "Editing a profile writes the database but not `user`, so screens keep showing the old values until the app is reopened — for a student, You Might Like keeps ranking by their old interests.",
          where: "app/individual/account/components/EditProfileDrawer.tsx:106",
        },
      ],
    },
  ],
};
