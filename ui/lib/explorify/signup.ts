import type { Node } from "@/lib/data";
/* ═══ 1. SIGNING UP ════════════════════════════════════════════
   How an account and its profile come to exist: the student screen and
   its stages, the organisation copy, the category list both use, and what
   happens to someone who stops halfway. */
export const signup: Node = {
  id: "signup",
  title: "Signing Up",
  sub: "How a new student or organisation creates an account and proves their email with a six-digit code.",
  footprint: {
    dirs: ["app/(auth)/registerIndividual.tsx", "app/(auth)/registerOrg.tsx", "app/(auth)/campusSelection.tsx", "app/individual/index/data/categories.ts"],
    files: 4,
  },
  shape: { kind: "marks", ids: ["supabase"], note: "Supabase Auth: signUp, verifyOtp, updateUser" },
  state: "partial",
  unsure:
    "The code only reaches the inbox if the live Supabase project has email confirmation switched on and its email template contains the six-digit code. Both are set in the Supabase dashboard, not in this repo — and the repo's own local settings (`supabase/config.toml`) have confirmation switched off, which would skip the email entirely.",
  col: 0,
  row: 0,
  detail: `The login screen's "Don't have an account? Sign Up" link asks one question — Organization or Individual — and opens one of two sign-up screens. Each is a single screen that steps through five stages under a five-segment progress bar: a name, an email, the code from that email, a password, and 2 to 5 categories. The back arrow steps back one stage, or returns to login from the first.

Almost nothing is saved until the very last tap. Stage 2 creates the Supabase login account straight away, with a made-up password, only so that Supabase emails a code. Stage 3 checks the code, which signs the person in. The final tap sets the real password and writes the profile row — into \`individual\` for a student, \`organizations\` for an organisation — with the row's \`id\` set to the account's id. That shared id is how the app later tells which kind of user someone is (see Opening The App).

\`registerIndividual.tsx\` and \`registerOrg.tsx\` are near line-for-line copies, so a fix made to one has to be made to the other by hand.`,
  code: [
    { file: "app/(auth)/login.tsx", start: 134, end: 150, label: "Login asks: organisation or individual?" },
    { file: "app/(auth)/registerIndividual.tsx", start: 40, end: 50, label: "Everything the sign-up screen remembers" },
    { file: "app/(auth)/registerIndividual.tsx", start: 186, end: 192, label: "Back steps one stage, or returns to login" },
    { file: "app/(auth)/registerIndividual.tsx", start: 451, end: 460, label: "The five-segment progress bar" },
  ],
  anatomy: [
    {
      kind: "diagram",
      caption: "From the login screen to a home screen. The account is created before the profile row; the campus picker is never reached.",
      boxes: [
        { id: "login", label: "Login screen", sub: "\"Sign Up\" link", col: 0, row: 1 },
        { id: "choice", label: "Which kind?", sub: "Organization / Individual", col: 1, row: 1 },
        { id: "student", label: "Student sign-up", sub: "5 stages", col: 2, row: 0 },
        { id: "org", label: "Organisation sign-up", sub: "5 stages", col: 2, row: 2 },
        { id: "ind", label: "individual table", sub: "student profile row", col: 3, row: 0 },
        { id: "auth", label: "Supabase Auth", sub: "account, code, password", col: 3, row: 1 },
        { id: "orgs", label: "organizations table", sub: "organisation profile row", col: 3, row: 2 },
        { id: "shome", label: "Student home", sub: "/individual", col: 4, row: 0, tone: "good" },
        { id: "campus", label: "Campus picker", sub: "nothing opens it", col: 4, row: 1, tone: "warn" },
        { id: "ohome", label: "Organisation home", sub: "/org", col: 4, row: 2, tone: "good" },
      ],
      arrows: [
        { from: "login", to: "choice" },
        { from: "choice", to: "student", label: "Individual" },
        { from: "choice", to: "org", label: "Organization" },
        { from: "student", to: "ind", label: "profile, last" },
        { from: "student", to: "auth", label: "account, first" },
        { from: "org", to: "auth" },
        { from: "org", to: "orgs", label: "profile, last" },
        { from: "ind", to: "shome", label: "then opens", tone: "good" },
        { from: "orgs", to: "ohome", label: "then opens", tone: "good" },
        { from: "campus", to: "orgs", label: "would set campus", tone: "warn" },
      ],
    },
    {
      kind: "table",
      caption: "The five stages, as a student sees them",
      columns: ["Stage", "On screen", "What happens"],
      state: "derived",
      rows: [
        ["1. Name", "\"What's your full name?\"", "Kept on the phone only. Continue stays grey until something is typed."],
        ["2. Email", "\"What's your email address?\" and Send Verification Code", "Creates the Supabase account with a made-up password; Supabase emails a code."],
        ["3. Code", "\"Verify Your Email\" and a 6-digit box", "Checks the code. The person is now signed in."],
        ["4. Password", "\"Set your password\"", "Checked on the phone: 8+ characters, a capital, a digit. Not sent yet."],
        ["5. Interests", "\"Let's select your interests\"", "Pick 2 to 5. Complete Registration saves the password and the profile row, then opens the home screen."],
      ],
    },
  ],
  issues: [
    {
      title: "Two copies of one sign-up",
      detail:
        "The student and organisation sign-up screens are separate files with the same logic. A bug fixed in one — the made-up password, the \"UIUC\" first feed — stays in the other unless someone fixes it twice.",
      where: "app/(auth)/registerOrg.tsx:1",
    },
  ],
  children: [
    {
      id: "su-student",
      title: "Student Sign-Up",
      sub: "Five stages on one screen that turn an email address into a signed-in student with a profile.",
      footprint: { dirs: ["app/(auth)/registerIndividual.tsx"], files: 1 },
      group: { ordering: "sequence" },
      state: "derived",
      col: 0,
      row: 0,
      detail: `One screen, \`RegisterIndividualScreen\`, holds a \`stage\` number from 1 to 5 and draws a different form for each. Everything typed is kept in the screen's memory until it is needed, so leaving the screen loses it.

Two calls to Supabase Auth happen in the middle — create the account at stage 2, check the emailed code at stage 3. Three things happen on the last tap: the real password replaces the made-up one, a row goes into \`individual\`, and that row is copied onto the phone as \`user\` before the student home opens.

The sequence below is the whole conversation, in order. Each stage that talks to Supabase has its own page underneath.`,
      code: [
        { file: "app/(auth)/registerIndividual.tsx", start: 40, end: 50, label: "What the screen keeps in memory" },
        { file: "app/(auth)/registerIndividual.tsx", start: 198, end: 234, label: "One form per stage: stage 1, the name" },
      ],
      anatomy: [
        {
          kind: "sequence",
          caption: "A student signing up, start to finish",
          actors: ["Phone", "Supabase Auth", "Email inbox", "Database"],
          rows: [
            { from: "Phone", to: "Phone", label: "name typed, kept in memory", state: "derived" },
            { from: "Phone", to: "Supabase Auth", label: "sign up: email + made-up password", state: "derived" },
            { from: "Supabase Auth", to: "Email inbox", label: "a 6-digit code", note: "needs a dashboard setting", state: "partial" },
            { from: "Phone", to: "Phone", label: "made-up password saved on the phone", state: "derived" },
            { from: "Phone", to: "Supabase Auth", label: "verify: email + code", state: "derived" },
            { from: "Supabase Auth", to: "Phone", label: "a session: signed in", state: "derived" },
            { from: "Phone", to: "Phone", label: "password checked, kept in memory", state: "derived" },
            { from: "Phone", to: "Supabase Auth", label: "set the real password", state: "derived" },
            { from: "Phone", to: "Database", label: "insert a row into individual", state: "derived" },
            { from: "Database", to: "Phone", label: "the new row, cached as \"user\"", state: "derived" },
            { from: "Phone", to: "Database", label: "events for campus \"UIUC\" (none match)", state: "derived" },
          ],
        },
      ],
      children: [
        {
          id: "su-email",
          title: "Sending The Code",
          sub: "Stage 2 creates the account with a made-up password so that Supabase will email a code.",
          state: "partial",
          unsure:
            "Whether the email holds a six-digit code — rather than a link, or nothing at all — depends on the Supabase project's email confirmation setting and email template, which live in the Supabase dashboard. The repo's local `supabase/config.toml` has `enable_confirmations = false`.",
          col: 0,
          row: 0,
          detail: `Supabase's \`signUp\` needs both an email and a password, but the app does not ask for a password until stage 4. So \`sendOTP\` invents one — "Temp", then random letters, then the current time in milliseconds — and calls \`signUp\` with it. The Supabase account exists from this moment.

With email confirmation switched on in the project, Supabase then sends a confirmation email, which the app expects to contain a 6-digit code. The made-up password is saved on the phone under the key \`tempPassword\` — though nothing ever reads it back — and the screen moves to stage 3 with the alert "Please check your email for the verification code."

The made-up password is replaced at the final stage. If the person never gets there, it stays the account's password, and nobody knows it.`,
          code: [
            { file: "app/(auth)/registerIndividual.tsx", start: 57, end: 83, label: "Stage 2: create the account and send the code" },
            { file: "app/(auth)/registerIndividual.tsx", start: 85, end: 87, label: "How the made-up password is built" },
            { file: "app/(auth)/registerIndividual.tsx", start: 236, end: 276, label: "What stage 2 shows" },
            { file: "supabase/config.toml", start: 98, end: 101, label: "Local settings: email confirmation off" },
          ],
          anatomy: [
            {
              kind: "screen",
              title: "Stage 2 of 5",
              items: [
                { type: "heading", label: "What's your email address?" },
                { type: "text", label: "Feel free to use your personal or school email!" },
                { type: "field", label: "Email address", note: "email keyboard, no auto-capitals; spaces at the ends are trimmed before sending" },
                { type: "button", label: "Send Verification Code", note: "grey until something is typed; creates the account and asks Supabase to send the code" },
              ],
            },
            {
              kind: "example",
              caption: "A made-up password (example value)",
              value: "Tempq8f3k2l9x0m1712345678901",
              notes: [
                { label: "Temp", value: "always the same start", state: "derived" },
                { label: "q8f3k2l9x0m", value: "Math.random() written in base 36 — not a secure random source", state: "derived" },
                { label: "1712345678901", value: "the time it was made, in milliseconds", state: "derived" },
                { label: "Kept at", value: "phone storage key tempPassword, as plain text", state: "derived" },
              ],
            },
          ],
          issues: [
            {
              title: "Quitting leaves an unknown password",
              detail:
                "If someone stops after this stage, their account's password is the made-up one. They cannot log in, and Reset Password turns them away because it looks for a profile row that was never written (see Quitting Halfway Through).",
              where: "app/(auth)/registerIndividual.tsx:60",
            },
            {
              title: "Password kept in plain text on the phone",
              detail:
                "`tempPassword` is written to phone storage and removed only after a successful final stage. Nothing in the app ever reads it, so storing it buys nothing.",
              where: "app/(auth)/registerIndividual.tsx:68",
            },
          ],
        },
        {
          id: "su-code",
          title: "Checking The Code",
          sub: "Stage 3 sends the six digits back to Supabase; a match signs the person in.",
          state: "derived",
          col: 0,
          row: 1,
          detail: `The box takes digits only, at most six, and Verify Code stays grey until exactly six are typed. \`verifyOTP\` sends the email and the code to Supabase Auth with type \`signup\`.

A correct code returns a session: the person is now signed in on this phone, and the Supabase client keeps that session in phone storage so it survives a restart. The screen holds the session in memory for the final stage and saves the account id on the phone as \`uuid\` — the key later screens use to know who is signed in.

A wrong or expired code shows Supabase's own error message, or "Invalid verification code. Please try again." if there is none. There is no resend button: going back to stage 2 and tapping Send again calls \`signUp\` a second time, with a new made-up password.`,
          code: [
            { file: "app/(auth)/registerIndividual.tsx", start: 89, end: 112, label: "Stage 3: check the code and save the id" },
            { file: "app/(auth)/registerIndividual.tsx", start: 278, end: 316, label: "What stage 3 shows" },
            { file: "lib/supabase.ts", start: 9, end: 16, label: "The Supabase client keeps its session in phone storage" },
          ],
          anatomy: [
            {
              kind: "screen",
              title: "Stage 3 of 5",
              items: [
                { type: "heading", label: "Verify Your Email" },
                { type: "text", label: "Make sure to check your spam!" },
                { type: "field", label: "6-digit Verification Code", note: "number pad, at most 6 digits" },
                { type: "button", label: "Verify Code", note: "grey until 6 digits are typed; a match signs the person in" },
              ],
            },
          ],
        },
        {
          id: "su-password",
          title: "Choosing A Password",
          sub: "Stage 4 checks the new password on the phone; it is only saved at the final tap.",
          state: "derived",
          col: 0,
          row: 2,
          detail: `The rule is one regular expression in \`isPasswordValid\`: at least 8 characters, at least one capital letter and at least one digit. Continue stays grey until it passes, and the eye icon shows or hides what is typed.

Nothing is sent to Supabase here. The password waits in the screen's memory and is set with \`updateUser\` on the final tap — so until then, the account's password is still the made-up one from stage 2.

The rule lives only in this screen and its organisation copy. Resetting A Password does not check it, so a password changed there can be anything Supabase itself accepts.`,
          code: [
            { file: "app/(auth)/registerIndividual.tsx", start: 52, end: 55, label: "The password rule" },
            { file: "app/(auth)/registerIndividual.tsx", start: 318, end: 365, label: "What stage 4 shows" },
          ],
          anatomy: [
            {
              kind: "table",
              caption: "The password rule",
              columns: ["Rule", "Fails", "Passes"],
              state: "derived",
              rows: [
                ["8 or more characters", "Abcde12", "Abcdef12"],
                ["At least one capital letter", "abcdef12", "Abcdef12"],
                ["At least one digit", "Abcdefgh", "Abcdef12"],
              ],
            },
            {
              kind: "screen",
              title: "Stage 4 of 5",
              items: [
                { type: "heading", label: "Set your password" },
                { type: "text", label: "It needs to be at least 8 characters long, with at least one number and one capital letter" },
                { type: "field", label: "Password", note: "hidden; the eye icon shows it" },
                { type: "button", label: "Continue", note: "grey until the rule passes; nothing is sent yet" },
              ],
            },
          ],
        },
        {
          id: "su-finish",
          title: "Saving The Profile",
          sub: "The last tap sets the real password, writes the profile row and opens the home screen.",
          state: "derived",
          col: 0,
          row: 3,
          detail: `Stage 5 is where the categories are picked (see Interest Categories). Complete Registration stays grey until two are chosen. Then \`signUpWithEmail\` runs the steps below in order, stopping with a "Registration Failed" alert at the first error.

The row's \`id\` is set to the Supabase account id. That equality is the only link between a login and its profile, and it is what Opening The App looks up on every launch to decide student or organisation.

Two steps do less than they appear to. The row returned by the insert is cached, then immediately fetched again and cached again. And the first feed is fetched for the campus "UIUC", which matches no event because events store the university's full name — harmless only because the home screen fetches again for the real campus.`,
          code: [
            { file: "app/(auth)/registerIndividual.tsx", start: 114, end: 175, label: "The final tap, start to finish" },
            { file: "app/(auth)/registerIndividual.tsx", start: 121, end: 140, label: "Set the password, then insert the row" },
            { file: "app/(auth)/registerIndividual.tsx", start: 154, end: 164, label: "Clean up, first feed, open the home screen" },
            { file: "app/(auth)/registerIndividual.tsx", start: 367, end: 427, label: "What stage 5 shows" },
          ],
          anatomy: [
            {
              kind: "screen",
              title: "Stage 5 of 5",
              items: [
                { type: "heading", label: "Let's select your interests" },
                { type: "text", label: "Select up to 5 categories to proceed, this will help us personalize your experience!" },
                { type: "choice", label: "Social 👫", note: "one of the 8 categories; tap to select, tap again to remove, a sixth is ignored" },
                { type: "choice", label: "STEM 🔬" },
                { type: "button", label: "Complete Registration", note: "grey until 2 are chosen; runs the steps below" },
              ],
            },
            {
              kind: "flow",
              rows: [
                { n: 1, title: "Set the real password", detail: "`updateUser` replaces the made-up password with the one from stage 4.", state: "derived" },
                { n: 2, title: "Write the profile row", detail: "Insert into `individual`: id, email, full_name, interests. The database hands back the new row.", state: "derived" },
                { n: 3, title: "Copy it onto the phone", detail: "Saved as `user`, then fetched again from the database and saved again.", state: "derived" },
                { n: 4, title: "Clean up", detail: "Removes `tempPassword`, and `registrationInProgress` — a key nothing ever sets.", state: "derived" },
                { n: 5, title: "Fetch a first feed", detail: "Upcoming events for campus \"UIUC\". None match, so an empty list is cached.", state: "derived" },
                { n: 6, title: "Open the student home", detail: "`router.replace(\"/individual\")`, so Back cannot return to sign-up.", state: "derived" },
              ],
            },
            {
              kind: "example",
              caption: "The row it writes (example values)",
              value: `individual
{
  "id": "5f0c2a1e-…",          ← the same id as the login account
  "email": "sam@illinois.edu",
  "full_name": "Sam Lee",
  "interests": ["stem", "social"]
}`,
              notes: [
                { label: "Organisations", value: "an organizations row instead: id, email, org_name, type (the categories)", state: "derived" },
              ],
            },
          ],
          issues: [
            {
              title: "First feed asks for a campus no event has",
              detail:
                "`fetchAllEvents(\"UIUC\")` filters events by campus, but events store the full name (\"University of Illinois Urbana-Champaign\"). An empty list is cached; the student home replaces it once it knows the real campus.",
              where: "app/(auth)/registerIndividual.tsx:161",
            },
          ],
        },
      ],
    },
    {
      id: "su-org",
      title: "Organisation Sign-Up",
      sub: "The same five stages, worded for an organisation and saving an organizations row.",
      footprint: { dirs: ["app/(auth)/registerOrg.tsx", "app/(auth)/campusSelection.tsx"], files: 2 },
      state: "derived",
      col: 0,
      row: 1,
      detail: `\`registerOrg.tsx\` is a copy of the student sign-up with names changed. The stages, the code check, the password rule, the clean-up and even the "UIUC" first feed are identical; the table below lists every difference.

An organisation's categories are saved in a column called \`type\` and describe the organisation itself. Each event gets its own categories when it is created.

One thing an organisation needs is never asked: its campus. The Other Events tab reads \`campus\` from the organisation's profile to decide which events to show, and nothing reachable in the app ever writes it. A screen for choosing it exists, but nothing opens it.`,
      code: [
        { file: "app/(auth)/registerOrg.tsx", start: 117, end: 127, label: "The organisations row: no campus" },
        { file: "app/(auth)/registerOrg.tsx", start: 187, end: 199, label: "Stage 1, worded for an organisation" },
        { file: "app/org/otherevents/index.tsx", start: 40, end: 58, label: "Other Events needs a campus on the profile" },
      ],
      anatomy: [
        {
          kind: "table",
          caption: "Everything that differs from the student sign-up",
          columns: ["What", "Student", "Organisation"],
          state: "derived",
          rows: [
            ["Stage 1 asks", "What's your full name?", "What's your organization name?"],
            ["Stage 2 hint", "Feel free to use your personal or school email!", "Use your official organization email"],
            ["Stage 5 asks", "Let's select your interests", "Select your organization's categories"],
            ["Row written to", "individual", "organizations"],
            ["Name column", "full_name", "org_name"],
            ["Categories column", "interests", "type"],
            ["Opens afterwards", "/individual, the student home", "/org, the organisation home"],
            ["Campus", "not asked; chosen later on the student home", "not asked, and never set"],
          ],
        },
        {
          kind: "diagram",
          caption: "Where an organisation's campus should come from, and the screen that needs it",
          boxes: [
            { id: "signup", label: "Organisation sign-up", sub: "writes 4 columns", col: 0, row: 0 },
            { id: "picker", label: "Campus picker", sub: "nothing opens it", col: 0, row: 1, tone: "warn" },
            { id: "row", label: "organizations row", sub: "id, email, org_name, type", col: 1, row: 0 },
            { id: "campus", label: "campus column", sub: "stays empty", col: 1, row: 1, tone: "warn" },
            { id: "other", label: "Other Events tab", sub: "shows nothing without it", col: 2, row: 1, tone: "warn" },
          ],
          arrows: [
            { from: "signup", to: "row", label: "inserts" },
            { from: "picker", to: "campus", label: "would write", tone: "warn" },
            { from: "campus", to: "other", label: "read by", tone: "warn" },
          ],
        },
      ],
      issues: [
        {
          title: "Organisations never get a campus",
          detail:
            "Sign-up writes no campus and the only screen that would is unreachable. Other Events shows nothing for any organisation whose campus was not filled in some other way, such as by hand in the Supabase dashboard.",
          where: "app/(auth)/registerOrg.tsx:118",
        },
      ],
      children: [
        {
          id: "su-campus",
          title: "Campus Picker",
          sub: "A finished screen for choosing an organisation's university that no part of the app opens.",
          footprint: { dirs: ["app/(auth)/campusSelection.tsx"], files: 1 },
          state: "derived",
          col: 0,
          row: 0,
          detail: `\`campusSelection.tsx\` lists the universities from the shared university list, with a search box that matches either the name or the abbreviation. Tapping one writes that university's full name into \`organizations.campus\` for the signed-in organisation and opens the organisation home.

It was written as a piece of a sign-up screen: it expects \`stage\`, \`session\`, \`supabase\` and \`router\` to be handed to it, and no file hands them over. Because it sits in the \`app/\` folder, Expo Router still treats it as a page at \`/campusSelection\`, but nothing links there — and opened directly it would fail at the first tap, because \`session\` and \`supabase\` are missing.

If the search matches nothing, it says "Don't see your university? Email us at explorifydev@gmail.com".`,
          code: [
            { file: "app/(auth)/campusSelection.tsx", start: 14, end: 21, label: "What it expects to be handed, and never is" },
            { file: "app/(auth)/campusSelection.tsx", start: 38, end: 54, label: "Saving the chosen campus" },
            { file: "app/(auth)/campusSelection.tsx", start: 1, end: 12, label: "Its imports: no Alert" },
            { file: "app/(auth)/campusSelection.tsx", start: 56, end: 125, label: "What it shows" },
          ],
          anatomy: [
            {
              kind: "screen",
              title: "Choose your campus",
              items: [
                { type: "heading", label: "Choose your campus" },
                { type: "text", label: "Select the university where your organization is based" },
                { type: "field", label: "Search for a university...", note: "matches the name or the abbreviation" },
                { type: "list", label: "University of Illinois Urbana-Champaign · UIUC", note: "tap: saves the full name as the campus, then opens /org" },
                { type: "text", label: "Don't see your university? Email us at explorifydev@gmail.com", note: "shown only when nothing matches" },
              ],
            },
          ],
          issues: [
            {
              title: "Nothing opens this screen",
              detail:
                "No file imports or links to it, so organisations are never asked for a campus and Other Events stays empty for them.",
              where: "app/(auth)/campusSelection.tsx:14",
            },
            {
              title: "Its error message would crash",
              detail:
                "When saving fails it calls `Alert.alert`, but `Alert` is not imported in this file, so the failure path throws instead of showing a message.",
              where: "app/(auth)/campusSelection.tsx:52",
            },
          ],
        },
      ],
    },
    // The exemplar for round 3 (D34): the thing itself as data, a picture of
    // where it travels, plain names, problems listed, code last.
    {
      id: "su-cats",
      title: "Interest Categories",
      sub: "The eight kinds of event, used to match students with events",
      footprint: { dirs: ["app/individual/index/data/categories.ts"], files: 1 },
      state: "derived",
      col: 0,
      row: 2,
      detail: "Every student and every event is tagged from one fixed list of eight categories. The feed ranks events by how many of their tags match a student's interests.",
      code: [
        { file: "app/individual/index/data/categories.ts", start: 1, end: 10, label: "The list itself" },
        { file: "app/(auth)/registerIndividual.tsx", start: 177, end: 184, label: "Picking interests: a sixth tap is ignored" },
        { file: "app/(auth)/registerIndividual.tsx", start: 411, end: 416, label: "Continue stays grey until two are picked" },
        { file: "app/individual/index/components/youmightlike.tsx", start: 57, end: 62, label: "Scoring an event by how many categories match" },
        { file: "app/(auth)/registerIndividual.tsx", start: 29, end: 38, label: "The unused copy of the list" },
      ],
      anatomy: [
        {
          kind: "table",
          caption: "The eight categories",
          columns: ["Shown as", "Stored as"],
          state: "derived",
          rows: [
            ["Social 👫", "social"],
            ["Cultural 🎭", "cultural"],
            ["STEM 🔬", "stem"],
            ["Sports & Recreation 🎯", "sports & recreation"],
            ["Business, Law & Policy 🏛️", "business, law & policy"],
            ["Education & Social Service 🎓", "education & social services"],
            ["Religion & Philosophy 🤔", "religion & philosophy"],
            ["Health & Wellbeing 💪", "health & wellbeing"],
          ],
        },
        {
          kind: "diagram",
          caption: "Where the categories are picked, where they are stored, and where they meet",
          boxes: [
            { id: "list", label: "The list", sub: "categories.ts", col: 0, row: 1 },
            { id: "student", label: "Student sign-up", sub: "picks 2–5 interests", col: 1, row: 0 },
            { id: "org", label: "Organisation sign-up", sub: "picks 2–5 types", col: 1, row: 1 },
            { id: "form", label: "Event form", sub: "tags at least 1", col: 1, row: 2 },
            { id: "interests", label: "individual.interests", sub: "on the student", col: 2, row: 0 },
            { id: "orgtype", label: "organizations.type", sub: "on the organisation", col: 2, row: 1 },
            { id: "evtype", label: "events.type", sub: "on the event", col: 2, row: 2 },
            { id: "yml", label: "You Might Like", sub: "ranks by overlap", col: 3, row: 1, tone: "good" },
          ],
          arrows: [
            { from: "list", to: "student" },
            { from: "list", to: "org" },
            { from: "list", to: "form" },
            { from: "student", to: "interests", label: "saves" },
            { from: "org", to: "orgtype", label: "saves" },
            { from: "form", to: "evtype", label: "saves" },
            { from: "interests", to: "yml", tone: "good" },
            { from: "evtype", to: "yml", tone: "good" },
          ],
        },
        {
          kind: "table",
          caption: "Every screen that shows the list",
          columns: ["Screen", "What it does with it"],
          state: "derived",
          rows: [
            ["Student sign-up", "Pick 2 to 5 interests; Continue stays grey until two are picked"],
            ["Edit profile (student)", "Change interests later, still at most 5"],
            ["Organisation sign-up", "Pick 2 to 5 categories that describe the organisation"],
            ["Event form", "Tag the event; publishing needs at least one"],
            ["Search (student and organisation)", "Filter buttons — show only events with that category"],
          ],
        },
        {
          kind: "example",
          caption: "What gets stored",
          value: `individual.interests  = ["stem", "social"]
events.type           = ["stem", "business, law & policy"]`,
          notes: [
            { label: "a match", value: "\"stem\" is in both, so this event scores 1 of 2 interests → 2.5 of its 5 category points", state: "derived" },
          ],
        },
      ],
      issues: [
        {
          title: "A second copy of the list that does nothing",
          detail:
            "The student sign-up file defines its own `interestsList` with the same eight values and never shows it. Editing it changes nothing on screen — the real list is categories.ts.",
          where: "app/(auth)/registerIndividual.tsx:29",
        },
      ],
    },
    {
      id: "su-abandon",
      title: "Quitting Halfway Through",
      sub: "What happens to someone who leaves sign-up after the email stage but before the last tap.",
      state: "partial",
      unsure:
        "What Supabase does when the same email signs up a second time — send a fresh code, or report the address as taken — depends on project settings in the Supabase dashboard, which are not in this repo.",
      col: 0,
      row: 3,
      detail: `The Supabase login account is created at stage 2 and the profile row only at stage 5. Anyone who closes the app in between — or whose final tap fails — is left with a login that has no profile row and a made-up password nobody knows.

Every way back in looks for that profile row, so every one fails. Opening the app finds a signed-in user in neither profile table and goes nowhere. Logging in needs the password. Reset Password looks the email up in the two profile tables, finds nothing, and says "No account found with this email. Please create an account first." Nothing in the app removes the half-made account.

Signing up again with the same email calls \`signUp\` again; what Supabase does then is not decided in this repo.`,
      code: [
        { file: "app/(auth)/registerIndividual.tsx", start: 57, end: 68, label: "The login is created at stage 2" },
        { file: "app/(auth)/registerIndividual.tsx", start: 128, end: 140, label: "The profile row only at stage 5" },
        { file: "app/_layout.tsx", start: 53, end: 82, label: "Launch: no branch for \"in neither table\"" },
        { file: "app/(auth)/resetPassword.tsx", start: 85, end: 94, label: "Reset: no profile row means no reset" },
      ],
      anatomy: [
        {
          kind: "diagram",
          caption: "Every way back in looks for the profile row that was never written",
          boxes: [
            { id: "acct", label: "Login, no profile", sub: "left after stage 2–4", col: 0, row: 1, tone: "warn" },
            { id: "open", label: "Opening the app", sub: "in neither table", col: 1, row: 0 },
            { id: "login", label: "Logging in", sub: "password unknown", col: 1, row: 1 },
            { id: "reset", label: "Reset password", sub: "looks in profile tables", col: 1, row: 2 },
            { id: "stuck", label: "Stuck", sub: "no way forward", col: 2, row: 1, tone: "warn" },
          ],
          arrows: [
            { from: "acct", to: "open" },
            { from: "acct", to: "login" },
            { from: "acct", to: "reset" },
            { from: "open", to: "stuck", label: "no route", tone: "warn" },
            { from: "login", to: "stuck", label: "wrong password", tone: "warn" },
            { from: "reset", to: "stuck", label: "no account found", tone: "warn" },
          ],
        },
        {
          kind: "table",
          caption: "Where they end up, by the stage they left at",
          columns: ["Left after", "Next time they open the app", "Reset Password"],
          state: "derived",
          rows: [
            ["Stage 2 (code sent)", "Login screen — not signed in, and the password is the made-up one", "\"No account found with this email\""],
            ["Stage 3 or 4 (code checked)", "Signed in but in neither table: nothing opens", "\"No account found with this email\""],
          ],
        },
      ],
      issues: [
        {
          title: "Half-made accounts are stuck for good",
          detail:
            "The login is created before the profile, and no screen can recover a login without one. The person cannot get in, cannot reset, and has to rely on whatever Supabase does with a second sign-up for the same email.",
          where: "app/(auth)/registerIndividual.tsx:61",
        },
      ],
    },
  ],
};
