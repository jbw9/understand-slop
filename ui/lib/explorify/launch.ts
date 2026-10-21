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
  detail: `There is no "role" field anywhere in the app. A user is a student if the \`individual\` table has a row with their account id, and an organisation if \`organizations\` has one. Students get the student home (tabs: Saved, Home, Account); organisations get the organisation home (tabs: Other Events, Home, Account).

On every launch Expo Router loads \`app/_layout.tsx\`, which wraps every screen, and \`app/index.tsx\`, the first screen. Both ask Supabase who is signed in and run that lookup — so it runs twice at once — and logging in runs it a third time. Along the way the account id, and then the whole profile row, are copied into phone storage, which is where almost every later screen reads them from.

Someone who is signed in but whose id is in neither table — a sign-up abandoned after the code — is not sent anywhere.`,
  code: [
    { file: "app/_layout.tsx", start: 46, end: 90, label: "The launch check in the root layout" },
    { file: "app/index.tsx", start: 18, end: 74, label: "The same check again on the first screen" },
    { file: "app/(auth)/login.tsx", start: 62, end: 112, label: "And again after logging in" },
  ],
  anatomy: [
    {
      kind: "table",
      caption: "Where you end up",
      columns: ["Signed in?", "Row in individual?", "Row in organizations?", "Opens"],
      state: "derived",
      rows: [
        ["No", "—", "—", "Login screen"],
        ["Yes", "Yes", "not asked", "Student home"],
        ["Yes", "No", "Yes", "Organisation home"],
        ["Yes", "No", "No", "Nothing — stays on the opening screen"],
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
      detail: `\`checkUser\` in \`app/_layout.tsx\` runs once when the app starts. \`supabase.auth.getUser()\` asks Supabase Auth to confirm the session saved on the phone and returns the account, or nothing.

With an account, it saves the id on the phone as \`uuid\`, then asks \`individual\` for a row with that id; a row sends you to \`/individual\`. Otherwise it asks \`organizations\`, and a row there sends you to \`/org\`. Either way it then starts copying the full profile onto the phone in the background. With no account, it goes to \`/login\`.

Three details matter. The order means an id in both tables is always a student. The \`uuid\` save is not waited for, and the profile copy starts only after the home screen is opened — so a home screen can appear before its profile is on the phone, which is why several screens wait and retry (see Saved On The Phone). And query errors are ignored, so a failed lookup looks the same as "not in this table".`,
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
            { n: 1, title: "Who is signed in", detail: "`getUser()`; the id is saved as `uuid` without waiting.", state: "derived" },
            { n: 2, title: "Student?", detail: "A row in `individual` with this id → `/individual`, then the profile is copied.", state: "derived" },
            { n: 3, title: "Organisation?", detail: "Otherwise a row in `organizations` → `/org`, then the profile is copied.", state: "derived" },
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
      detail: `The login screen takes an email and a password and calls \`signInWithPassword\`. On success it saves the account id as \`uuid\`, looks for the id in \`individual\` and then \`organizations\`, copies the matching row onto the phone as \`user\`, and replaces the screen with the right home.

It is a third copy of the launch check, written differently: it waits for each step, and it asks for exactly one row with \`.single()\`, which reports "no rows" as an error. The student check allows for that error; the organisation check does not. So a correct password for a login with no profile shows Supabase's raw "no rows" error instead of the intended "No matching profile found".

The same file links to Forgot password and to Sign Up, and switches Supabase's automatic token refresh on whenever the app comes to the foreground and off when it goes to the background.`,
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
          items: [
            { type: "heading", label: "Welcome back!" },
            { type: "field", label: "✉️ Email", note: "email keyboard, no auto-capitals; trimmed before sending" },
            { type: "field", label: "🔑 Password", note: "hidden; the eye icon shows it" },
            { type: "text", label: "Forgot password", note: "opens Resetting A Password" },
            { type: "button", label: "Login", note: "alerts \"Please enter both email and password\" if either is empty" },
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
      ],
      issues: [
        {
          title: "Wrong error for a login with no profile",
          detail:
            "When neither table has the id, the organisation query's \"no rows\" error is thrown before the code reaches \"No matching profile found\", so the person sees a database message instead.",
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
      detail: `\`app/_layout.tsx\` wraps every screen and \`app/index.tsx\` is the first screen, so on launch both mount and both run their own \`checkUser\`. Neither knows about the other. \`login.tsx\` has a third version that runs after a password sign-in.

They differ in small ways, listed below. For an organisation, both launch copies open \`/org\` — one pushes it, the other replaces the current screen with it — in whichever order the network answers.

The first-screen copy is also broken for students: before routing a student it tries to save a phone notification token from a variable that does not exist, which throws. Students still reach their home only because the root layout's copy routes them.`,
      code: [
        { file: "app/_layout.tsx", start: 46, end: 90, label: "Copy 1: the root layout" },
        { file: "app/index.tsx", start: 18, end: 74, label: "Copy 2: the first screen" },
        { file: "app/(auth)/login.tsx", start: 39, end: 124, label: "Copy 3: the login screen" },
      ],
      anatomy: [
        {
          kind: "diagram",
          caption: "Two copies run on every launch; only the root layout's routes a student",
          boxes: [
            { id: "opens", label: "App opens", col: 0, row: 0 },
            { id: "layout", label: "Root layout check", sub: "app/_layout.tsx", col: 1, row: 0 },
            { id: "first", label: "First screen check", sub: "app/index.tsx", col: 1, row: 1 },
            { id: "shome", label: "Student home", col: 2, row: 0, tone: "good" },
            { id: "ohome", label: "Organisation home", col: 2, row: 1, tone: "good" },
            { id: "crash", label: "Push token error", sub: "token is not defined", col: 2, row: 2, tone: "warn" },
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
            ["Students", "routed", "throws before routing", "routed"],
            ["In neither table", "nothing happens", "nothing happens", "raw \"no rows\" error"],
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
          detail: `For a student, \`app/index.tsx\` updates \`individual.expo_push_token\` with \`token.data\` before routing. Nothing in the file — or anywhere in the app — declares \`token\`, so this line throws a ReferenceError every time.

The error is caught by the surrounding \`catch\`, logged as "Error checking individual", and the check falls through to \`organizations\`, which finds nothing. The student reaches their home anyway, because the root layout's copy of the check sent them there.

\`expo-notifications\` is listed in package.json but imported nowhere: the code that once produced the token was removed and this line was left behind. No push token is ever saved for anyone.`,
          code: [
            { file: "app/index.tsx", start: 26, end: 44, label: "The student branch that throws" },
            { file: "package.json", start: 38, end: 38, label: "expo-notifications: installed, never imported" },
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
      detail: `\`lib/localStorage.ts\` wraps the phone's key-value store (AsyncStorage). \`storeData\` saves any value as JSON and \`retrieveData\` reads it back; three helpers fetch from Supabase and save the result — the signed-in profile from either table, and the upcoming events for a campus.

The profile is copied in at launch, login and sign-up and then trusted everywhere: screens read \`user\` for the name, photo, interests and id rather than asking the database. A change saved to the database without also updating \`user\` stays invisible until the next launch copies the profile again.

Because launch opens the home screen before the copy finishes, the two home screens, Other Events and the organisation Account tab wait for \`user\`: they look up to five more times, half a second apart, and give up after about 2.5 seconds.`,
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
