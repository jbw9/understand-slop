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
export const AUTHORED: Node[] = [
  /* ═══ 1. SIGN UP ═══════════════════════════════════════════════
     Five levels: the wizard → its five stages → the email stage → the
     throwaway password it invents → the source. */
  {
    id: "signup",
    title: "Sign Up",
    sub: "Two five-stage wizards, student and organisation, that prove an email with a six-digit code",
    footprint: {
      dirs: ["app/(auth)/", "app/individual/index/data/categories.ts"],
      files: 4,
    },
    group: { ordering: "set", note: "The wizard, its organisation twin, and the category list both draw from." },
    shape: { kind: "marks", ids: ["supabase"], note: "Supabase Auth: signUp, verifyOtp, updateUser" },
    state: "derived",
    col: 0,
    row: 0,
    detail:
      "Login offers one choice — organisation or individual — and each opens its own wizard. The two files are near copies: same stages, same code path, different table at the end.",
    evidence: "app/(auth)/registerIndividual.tsx, app/(auth)/registerOrg.tsx",
    children: [
      {
        id: "su-stages",
        title: "Five Stages",
        sub: "Name, email, code, password, interests — one screen each, in this order",
        footprint: { dirs: ["app/(auth)/registerIndividual.tsx"], files: 1 },
        group: { ordering: "sequence" },
        state: "derived",
        col: 0,
        row: 0,
        detail:
          "The account is created at stage 2, before a password exists, and the profile row only at stage 5. Quitting anywhere in between leaves an auth user with no profile.",
        evidence: "app/(auth)/registerIndividual.tsx:57",
        anatomy: [
          {
            kind: "flow",
            rows: [
              { n: 1, title: "Name", detail: "Full name, held in component state. Nothing is sent yet.", state: "derived" },
              {
                n: 2,
                title: "Email",
                detail: "supabase.auth.signUp runs here — the auth user exists from this moment, with a password nobody chose.",
                state: "derived",
                under: [
                  {
                    kind: "map",
                    caption: "what stage 2 sends, and why",
                    rows: [
                      {
                        from: "a temporary password",
                        to: "signUp demands one, so a random string is invented and parked on the phone",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "app/(auth)/registerIndividual.tsx",
                            start: 57,
                            code: `  const sendOTP = async () => {
    setLoading(true);
    try {
      const tempPassword = generateTemporaryPassword();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: tempPassword,
      });

      if (error) throw error;

      await storeData("tempPassword", tempPassword);`,
                            why: "signUp is used as \"send me a code\". The password is a placeholder that stage 4 overwrites — but it is written to AsyncStorage in plain text, and only removed if stage 5 succeeds.",
                          },
                        ],
                      },
                      {
                        from: "how it is made",
                        to: "Math.random in base 36 plus a timestamp — not a secure random source",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "app/(auth)/registerIndividual.tsx",
                            start: 85,
                            code: `  const generateTemporaryPassword = () => {
    return \`Temp\${Math.random().toString(36).slice(2)}\${Date.now()}\`;
  };`,
                            why: "Fine for a value that is replaced two screens later. It matters only if the wizard is abandoned, because then this is the account's password until a reset.",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                n: 3,
                title: "Code",
                detail: "verifyOtp with type \"signup\" returns a session; the user id is stored as \"uuid\" on the phone.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/(auth)/registerIndividual.tsx",
                    start: 89,
                    code: `  const verifyOTP = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp,
        type: "signup",
      });

      if (error) throw error;

      setSession(data.session);
      await storeData("uuid", data.session.user.id);
      setStage(4);`,
                    why: "From here the user is signed in. Every later screen identifies them by this stored \"uuid\", not by asking Supabase again.",
                  },
                ],
              },
              { n: 4, title: "Password", detail: "At least 8 characters, one capital, one digit — checked by a regex on the phone only.", state: "derived" },
              {
                n: 5,
                title: "Interests",
                detail: "Two to five categories. Then the real password replaces the temporary one and the profile row is inserted.",
                state: "derived",
                under: [
                  {
                    kind: "map",
                    caption: "what the final tap writes",
                    rows: [
                      {
                        from: "the profile row",
                        to: "individual: id, email, full_name, interests",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "app/(auth)/registerIndividual.tsx",
                            start: 121,
                            code: `      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) throw updateError;

      // Create individual profile
      const { data: individualData, error: individualError } = await supabase
        .from("individual")
        .insert({
          id: session.user.id,
          email: email.trim(),
          full_name: fullName.trim(),
          interests: selectedInterests,
        })
        .select()
        .single();`,
                            why: "The row's id IS the auth user id. That equality is the only link between an account and its profile — and, at launch, the only way the app tells a student from an organisation.",
                          },
                        ],
                      },
                      {
                        from: "a first feed",
                        to: "fetchAllEvents(\"UIUC\") — a campus key that matches no event",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "app/(auth)/registerIndividual.tsx",
                            start: 160,
                            code: `      // Fetch initial events
      await fetchAllEvents("UIUC");

      // Navigate to home`,
                            why: "Events store the campus as the full university name (\"University of Illinois Urbana-Champaign\"), so this caches an empty list. Harmless only because the home screen fetches again by GPS.",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "su-org",
        title: "Org Wizard",
        sub: "The same five stages, writing an organizations row instead",
        footprint: { dirs: ["app/(auth)/registerOrg.tsx", "app/(auth)/campusSelection.tsx"], files: 2 },
        group: { ordering: "set", note: "Where the copy differs from the student wizard." },
        state: "partial",
        col: 0,
        row: 1,
        detail:
          "Organisation name instead of full name, categories saved as `type`. The one thing an organisation needs that a student does not — its campus — is never asked.",
        evidence: "app/(auth)/registerOrg.tsx:117",
        anatomy: [
          {
            kind: "map",
            caption: "student wizard → organisation wizard",
            rows: [
              {
                from: "the row it writes",
                to: "organizations: id, email, org_name, type",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/(auth)/registerOrg.tsx",
                    start: 117,
                    code: `      // Create organization profile
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .insert({
          id: session.user.id,
          email: email.trim(),
          org_name: orgName.trim(),
          type: selectedCategories,
        })
        .select()
        .single();`,
                    why: "No campus column is written. The Other Events tab later reads organizations.campus and shows nothing without it.",
                  },
                ],
              },
              {
                from: "the campus picker",
                to: "a screen that exists but nothing opens — and it would crash on error",
                state: "partial",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "campusSelection.tsx", value: "Expects session, supabase and router as props; no file imports it", state: "derived" },
                      { label: "Alert", value: "Called on failure but never imported in that file", state: "derived" },
                      { label: "So who sets campus?", value: "Nothing reachable in this repo — presumably edited by hand in Supabase", state: "inferred" },
                    ],
                  },
                  {
                    kind: "source",
                    file: "app/(auth)/campusSelection.tsx",
                    start: 38,
                    code: `  const handleSelect = async (campus) => {
    setSelected(campus);

    try {
      const { error } = await supabase
        .from("organizations")
        .update({ campus: campus })
        .eq("id", session.user.id);

      if (error) throw error;

      router.replace("/org");
    } catch (error) {
      console.error("Error updating campus:", error);
      Alert.alert("Error", "Failed to update campus. Please try again.");
    }
  };`,
                    why: "The only writer of organizations.campus in the codebase. It reads `session`, `supabase` and `router` from props no caller passes.",
                  },
                ],
              },
              { from: "the code, the password, the cleanup", to: "identical, line for line", state: "derived" },
            ],
          },
        ],
      },
      {
        id: "su-cats",
        title: "Categories",
        sub: "Eight interest categories, shared by both wizards and the event form",
        footprint: { dirs: ["app/individual/index/data/categories.ts"], files: 1 },
        state: "derived",
        col: 0,
        row: 2,
        detail:
          "A student's interests and an event's `type` are both values from this list, which is what lets the feed score an event against a student.",
        evidence: "app/individual/index/data/categories.ts:1",
        anatomy: [
          {
            kind: "map",
            caption: "where the list lives",
            rows: [
              { from: "categories.ts", to: "the list both wizards render — social, cultural, stem, sports & recreation, and four more", state: "derived" },
              {
                from: "interestsList",
                to: "a second copy at the top of the student wizard, never rendered",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/(auth)/registerIndividual.tsx",
                    start: 29,
                    code: `const interestsList = [
  { label: "👥 Social", value: "social" },
  { label: "Cultural", value: "cultural" },
  { label: "STEM", value: "stem" },
  { label: "Sports & Recreation", value: "sports & recreation" },
  { label: "Business, Law & Policy", value: "business, law & policy" },
  { label: "Education & Social Service", value: "education & social services" },
  { label: "Religion & Philosophy", value: "religion & philosophy" },
  { label: "Health & Wellbeing", value: "health & wellbeing" },
];`,
                    why: "Dead code with the same values as categories.ts. Safe to delete; dangerous to edit, because a change here changes nothing on screen.",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  /* ═══ 2. LAUNCH ROUTING ═══════════════════════════════════════
     Five levels: routing → the check written three times → the index.tsx
     copy → its four steps → the undefined variable. */
  {
    id: "launch",
    title: "Launch Routing",
    sub: "On every open, the app decides student or organisation by which table holds your id",
    footprint: {
      dirs: ["app/_layout.tsx", "app/index.tsx", "app/(auth)/login.tsx", "lib/localStorage.ts"],
      files: 6,
    },
    group: { ordering: "set", note: "The lookup, its copies, and the cache it fills." },
    shape: { kind: "figure", id: "role-by-table", note: "There is no role column; an id in neither table has no exit" },
    state: "partial",
    col: 0,
    row: 1,
    detail:
      "There is no role field anywhere. A user is a student if their id is in `individual`, an organisation if it is in `organizations` — and that lookup is written out three separate times.",
    evidence: "app/_layout.tsx:46, app/index.tsx:18, app/(auth)/login.tsx:62",
    children: [
      {
        id: "ln-lookup",
        title: "Role Lookup",
        sub: "Ask individual, then organizations; route to whichever answers",
        footprint: { dirs: ["app/_layout.tsx"], files: 1 },
        group: { ordering: "sequence" },
        shape: { kind: "marks", ids: ["expo", "supabase"], note: "Expo Router picks the screen; a Supabase query picks the role" },
        state: "partial",
        col: 0,
        row: 0,
        detail:
          "The root layout runs this on mount. Order matters: an id in both tables would always be a student.",
        evidence: "app/_layout.tsx:46",
        anatomy: [
          {
            kind: "flow",
            rows: [
              { n: 1, title: "Who is signed in", detail: "supabase.auth.getUser(), then the id is stored on the phone as \"uuid\".", state: "derived" },
              {
                n: 2,
                title: "Student?",
                detail: "Any row in individual with this id sends you to /individual.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/_layout.tsx",
                    start: 46,
                    code: `    async function checkUser() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        storeData("uuid", user?.id);
        if (isMounted) {
          if (user) {
            try {
              const { data: individualData, error: individualError } =
                await supabase.from("individual").select("*").eq("id", user.id);
              console.log(individualData, individualError);
              if (individualData && individualData.length > 0) {
                router.push("/individual");
                fetchUserProfileIndividual();
                return;
              }`,
                    why: "storeData is not awaited and the profile fetch is fired after navigation, so the first screen can render before \"user\" is cached — which is why the home screens poll for it.",
                  },
                ],
              },
              { n: 3, title: "Organisation?", detail: "Otherwise, any row in organizations sends you to /org.", state: "derived" },
              {
                n: 4,
                title: "Neither",
                detail: "Signed in, in neither table — someone who quit the wizard after the code. No branch handles it.",
                state: "partial",
                under: [
                  {
                    kind: "source",
                    file: "app/_layout.tsx",
                    start: 66,
                    code: `            try {
              const { data: organizationData, error: organizationError } =
                await supabase
                  .from("organizations")
                  .select("*")
                  .eq("id", user.id);
              if (organizationData && organizationData.length > 0) {
                router.push("/org");
                fetchUserProfileOrg();
                return;
              }
            } catch (organizationError) {
              // console.error(organizationError);
            }
          } else {
            router.push("/login");
          }
        }`,
                    why: "The else only covers \"no user\". A user with no profile row falls out of both ifs and is sent nowhere; what they then see depends on the route they were already on.",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "ln-copies",
        title: "Three Copies",
        sub: "The same lookup in the root layout, the index screen and login — each slightly different",
        footprint: { dirs: ["app/_layout.tsx", "app/index.tsx", "app/(auth)/login.tsx"], files: 3 },
        group: { ordering: "set", note: "Three files, one decision; none calls the others." },
        state: "partial",
        alarm: true,
        col: 0,
        row: 1,
        detail:
          "_layout.tsx and index.tsx both run on launch, so the lookup races itself. The index copy also contains a variable that does not exist.",
        evidence: "app/index.tsx:35",
        anatomy: [
          {
            kind: "map",
            caption: "each copy, and how it differs",
            rows: [
              { from: "_layout.tsx", to: "router.push, swallows errors, no loading screen", state: "derived" },
              {
                from: "index.tsx",
                to: "router.replace, a spinner — and a push-token update that throws",
                state: "partial",
                under: [
                  {
                    kind: "flow",
                    rows: [
                      { n: 1, title: "Student row found", detail: "Same query as the root layout.", state: "derived" },
                      {
                        n: 2,
                        title: "Save push token",
                        detail: "Writes expo_push_token from `token.data` — and `token` is declared nowhere in the file.",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "app/index.tsx",
                            start: 26,
                            code: `            try {
              const { data: individualData } = await supabase
                .from("individual")
                .select("*")
                .eq("id", user.id);

              if (individualData && individualData.length > 0) {
                await supabase
                  .from("individual")
                  .update({ expo_push_token: token.data })
                  .eq("id", user.id);

                fetchUserProfileIndividual();
                router.replace("/individual");
                return;
              }`,
                            why: "A ReferenceError, caught by the surrounding catch, so this copy never routes a student. expo-notifications is in package.json and imported nowhere: the code that produced `token` was removed and this line was not.",
                          },
                        ],
                      },
                      { n: 3, title: "Falls through", detail: "The catch logs, then the organisation query runs and finds nothing. The student still lands home only because _layout.tsx routed them.", state: "inferred" },
                    ],
                  },
                ],
              },
              { from: "login.tsx", to: "the same two queries after signInWithPassword, with .single()", state: "derived" },
            ],
          },
        ],
      },
      {
        id: "ln-cache",
        title: "Phone Cache",
        sub: "AsyncStorage keys every screen reads instead of asking Supabase",
        footprint: { dirs: ["lib/localStorage.ts"], files: 1 },
        group: { ordering: "set", note: "Keys in one store; written at different moments." },
        state: "derived",
        col: 0,
        row: 2,
        detail:
          "lib/localStorage.ts is a JSON wrapper over AsyncStorage plus three fetchers. Screens read the cached profile, not the database — so a profile edited elsewhere is stale until the next fetch.",
        evidence: "lib/localStorage.ts:5",
        anatomy: [
          {
            kind: "map",
            caption: "key → what it holds",
            rows: [
              { from: "uuid", to: "the signed-in user's id, written at launch, login and sign-up", state: "derived" },
              {
                from: "user",
                to: "the whole profile row, from whichever table matched",
                state: "derived",
                under: [
                  {
                    kind: "map",
                    caption: "how it is filled, and how screens wait for it",
                    rows: [
                      {
                        from: "filled",
                        to: "select * by the cached uuid, then stored whole",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "lib/localStorage.ts",
                            start: 108,
                            code: `export const fetchUserProfileIndividual = async (): Promise<boolean> => {
  try {
    const uuid = await retrieveData("uuid");
    if (!uuid) {
      console.warn("No UUID found in storage");
      return false;
    }

    const { data, error } = await supabase
      .from("individual")
      .select("*")
      .eq("id", uuid)
      .single();`,
                            why: "Identity comes from the phone's cache, not from the session. The organisation version is the same function with the table name changed.",
                          },
                        ],
                      },
                      {
                        from: "waited for",
                        to: "a poll: up to five reads, 500 ms apart",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "app/individual/index/index.tsx",
                            start: 198,
                            code: `  const fetchUserProfile = async (userId) => {
    try {
      let user = await retrieveData("user");
      let retries = 0;
      const maxRetries = 5;

      while (!user && retries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        user = await retrieveData("user");
        retries++;
      }`,
                            why: "The fix for routing before the profile is cached, applied at the reader instead of the writer. The same loop appears in the org dashboard and Other Events.",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              { from: "events", to: "the current campus's upcoming events — see Event Feed", state: "derived" },
              { from: "tempPassword", to: "sign-up's placeholder password, in plain text until stage 5", state: "derived" },
            ],
          },
        ],
      },
    ],
  },

  /* ═══ 3. CREATE EVENT ═════════════════════════════════════════
     Five levels: creating → the draft row → its date → an evening in
     Illinois → the source. */
  {
    id: "create-event",
    title: "Create Event",
    sub: "An organisation fills a form, gets a draft, previews it, then publishes",
    footprint: {
      dirs: ["app/org/index/addEvent.tsx", "app/org/index/previewEvent.tsx", "app/org/index/editEvent/", "app/org/index/components/"],
      files: 9,
    },
    group: { ordering: "sequence" },
    shape: { kind: "figure", id: "event-states", note: "Draft and Published are one boolean; Archive is only a date comparison" },
    state: "partial",
    alarm: true,
    col: 0,
    row: 2,
    detail:
      "Preview is not a dry run: pressing it inserts the event as a draft row. Publishing flips one boolean. The date written on that row is in UTC while the time is local, so evening events land on the wrong day.",
    evidence: "app/org/index/addEvent.tsx:193",
    children: [
      {
        id: "ce-form",
        title: "Event Form",
        sub: "Name, description, categories, date, time, place, food, picture — and a campus",
        footprint: { dirs: ["app/org/index/addEvent.tsx", "app/org/index/editEvent/"], files: 4 },
        group: { ordering: "set", note: "Fields, each with its own rule." },
        shape: { kind: "marks", ids: ["googlemaps", "supabase"], note: "Places autocomplete for the address; a Supabase bucket for the picture" },
        state: "partial",
        col: 0,
        row: 0,
        detail:
          "Eight fields are required. Campus is not — yet campus is the only field the student feed filters by.",
        evidence: "app/org/index/addEvent.tsx:177",
        anatomy: [
          {
            kind: "map",
            caption: "field → its rule",
            rows: [
              {
                from: "required",
                to: "name, description, a category, date, end time, location, food, picture",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/org/index/addEvent.tsx",
                    start: 177,
                    code: `  const checkRequiredFields = () => {
    if (
      !name ||
      !description ||
      selectedCategories.length === 0 ||
      !date ||
      !endTime ||
      !location ||
      !food ||
      !thumbnail
    ) {
      return false;
    }
    return true;
  };`,
                    why: "Food is required, campus is not. An event saved with an empty campus is invisible to every student, with no error anywhere.",
                  },
                ],
              },
              {
                from: "campus",
                to: "meant to be guessed from the address; the guess can never run",
                state: "partial",
                under: [
                  {
                    kind: "flow",
                    rows: [
                      { n: 1, title: "Pick an address", detail: "Google Places autocomplete, with its key hard-coded at addEvent.tsx:415.", state: "derived" },
                      {
                        n: 2,
                        title: "Look up coordinates",
                        detail: "A second request for the place's geometry — sent with the literal key YOUR_API_KEY.",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "app/org/index/addEvent.tsx",
                            start: 394,
                            code: `                  axios
                    .get(
                      \`https://maps.googleapis.com/maps/api/place/details/json?place_id=\${data.place_id}&fields=geometry&key=YOUR_API_KEY\`
                    )
                    .then((response) => {
                      if (
                        response.data.result &&
                        response.data.result.geometry &&
                        response.data.result.geometry.location
                      ) {
                        const { lat, lng } =
                          response.data.result.geometry.location;
                        const nearestCampus = findNearestCampus(lat, lng);
                        setCampus(nearestCampus ? nearestCampus.name : "");
                      }`,
                            why: "A placeholder key gets no geometry back, so the if never passes and campus stays empty. The component already has fetchDetails on, so `details` held the coordinates all along. The same block is copied into editEvent/[id].tsx.",
                          },
                        ],
                      },
                      { n: 3, title: "Pick by hand", detail: "The campus drawer is the only way campus is ever set — if the organiser notices it is empty.", state: "derived" },
                    ],
                  },
                ],
              },
              {
                from: "picture",
                to: "uploaded twice — once to the avatar bucket when picked, again on preview",
                state: "derived",
                under: [
                  {
                    kind: "map",
                    caption: "the two uploads",
                    rows: [
                      {
                        from: "on pick",
                        to: "the image component uploads to user_avatar and never uses the result",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "app/org/index/editEvent/imageupload.tsx",
                            start: 39,
                            code: `          // Get file extension
          const fileExt = image.uri?.split(".").pop()?.toLowerCase() ?? "jpeg";
          const path = \`\${Date.now()}.\${fileExt}\`;

          // Upload to Supabase
          const { data, error: uploadError } = await supabase.storage
            .from("user_avatar")
            .upload(path, arraybuffer, {
              contentType: image.mimeType ?? "image/jpeg",
            });`,
                            why: "Every event picture leaves an orphan file in the avatar bucket. The upload's path is discarded; only the local URI is passed up.",
                          },
                        ],
                      },
                      {
                        from: "on preview",
                        to: "the form uploads again to event_thumbnail and stores its public URL",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "app/org/index/addEvent.tsx",
                            start: 148,
                            code: `      const fileExt =
        selectedImage.uri?.split(".").pop()?.toLowerCase() ?? "jpeg";
      const path = \`\${Date.now()}.\${fileExt}\`;

      const { data, error: uploadError } = await supabase.storage
        .from("event_thumbnail")
        .upload(path, arrayBuffer, {
          contentType: selectedImage.mimeType ?? "image/jpeg",
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }

      const { data: publicUrlData } = await supabase.storage
        .from("event_thumbnail")
        .getPublicUrl(path);

      return publicUrlData?.publicUrl;`,
                            why: "This is the copy events.thumbnail points at. A public URL means the bucket is public — anyone with the link can fetch it.",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "ce-draft",
        title: "Draft Row",
        sub: "Preview inserts the event with published = false",
        footprint: { dirs: ["app/org/index/addEvent.tsx", "app/org/index/editEvent/[id].tsx"], files: 2 },
        group: { ordering: "set", note: "The columns of one insert." },
        state: "partial",
        alarm: true,
        col: 0,
        row: 1,
        detail:
          "The row belongs to the organisation through `uuid`, its user id. Date and time are written as two text columns, cut from one JavaScript Date in two different time zones.",
        evidence: "app/org/index/addEvent.tsx:222",
        anatomy: [
          {
            kind: "map",
            caption: "column ← where it comes from",
            rows: [
              { from: "uuid", to: "the organisation's auth id — the owner of the event", state: "derived" },
              { from: "location", to: "an object: the Places description and its terms", state: "derived" },
              {
                from: "date",
                to: "the UTC calendar day — while time is local",
                state: "derived",
                under: [
                  {
                    kind: "map",
                    caption: "an 8 pm event, on a phone in Illinois (UTC−5 in autumn)",
                    rows: [
                      {
                        from: "on create",
                        to: "stored as tomorrow's date at 20:00",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "app/org/index/addEvent.tsx",
                            start: 222,
                            code: `      const previewEventData = {
        uuid: user.id,
        name,
        location,
        room_number: roomNumber,
        description,
        type: selectedCategories,
        thumbnail: thumbnailUrl,
        dress_code: attire,
        food,
        campus: campus,
        date: date ? date.toISOString().split("T")[0] : null,
        time: date ? date.toTimeString().split(" ")[0] : null,
        end_time: endTime ? endTime.toTimeString().split(" ")[0] : null,
        published: false,
      };

      const { data, error } = await supabase
        .from("events")
        .insert(previewEventData)
        .select();`,
                            why: "toISOString is UTC; toTimeString is local. 20:00 in Illinois is 01:00 UTC the next day, so `date` gets tomorrow and `time` gets 20:00. Any event at 19:00 or later (18:00 in winter) is listed a day late.",
                          },
                        ],
                      },
                      {
                        from: "on every edit",
                        to: "read back as local, saved as UTC — a day later again",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "app/org/index/editEvent/[id].tsx",
                            start: 218,
                            code: `    try {
      const eventDate = date.toISOString().split("T")[0];
      const eventTime = date.toTimeString().split(" ")[0];
      const eventEndTime = endTime
        ? endTime.toTimeString().split(" ")[0]
        : null;`,
                            why: "The edit screen rebuilds the Date from `${date}T${time}` as local time, then saves it with the same split. Each save of an evening event moves it one more day forward.",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              { from: "published", to: "false — the row is the draft", state: "derived" },
            ],
          },
        ],
      },
      {
        id: "ce-publish",
        title: "Publish",
        sub: "The preview screen flips published to true",
        footprint: { dirs: ["app/org/index/previewEvent.tsx"], files: 1 },
        group: { ordering: "sequence" },
        state: "derived",
        col: 0,
        row: 2,
        detail:
          "Because the draft already exists, \"back\" does not discard anything — it just says so. Publish is a single update.",
        evidence: "app/org/index/previewEvent.tsx:103",
        anatomy: [
          {
            kind: "flow",
            rows: [
              {
                n: 1,
                title: "Back saves a draft",
                detail: "Nothing is written; the row was inserted by Preview. The alert only reports it.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/org/index/previewEvent.tsx",
                    start: 69,
                    code: `  const handleBackPress = () => {
    Alert.alert("Draft Saved!", "Find drafts in the draft section.", [
      { text: "OK" },
    ]);
    navigation.navigate("index" as never);
  };`,
                    why: "Correct, but only because of the insert three screens earlier. Pressing Preview five times makes five drafts.",
                  },
                ],
              },
              { n: 2, title: "Edit", detail: "Opens editEvent/[id], which saves and returns to this preview.", state: "derived" },
              {
                n: 3,
                title: "Publish",
                detail: "One update, scoped by event id alone.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/org/index/previewEvent.tsx",
                    start: 103,
                    code: `  const handlePublish = async () => {
    try {
      const { error } = await supabase
        .from("events")
        .update({ published: true })
        .eq("id", eventData.id);

      if (error) throw error;`,
                    why: "No check that the caller owns the event; only row-level security could enforce that, and the policies are not in this repo.",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "ce-tabs",
        title: "Dashboard Tabs",
        sub: "Ongoing, Draft and Archive — three queries over the same rows",
        footprint: { dirs: ["app/org/index/components/"], files: 3 },
        group: { ordering: "set", note: "Three filters; an event is in exactly one." },
        state: "partial",
        col: 0,
        row: 3,
        detail:
          "Archive is not a state anyone writes. It is published events whose date is before today, filtered on the phone.",
        evidence: "app/org/index/components/archive.tsx:46",
        anatomy: [
          {
            kind: "map",
            caption: "tab → what selects it",
            rows: [
              { from: "Ongoing", to: "published, dated today or later", state: "derived" },
              { from: "Draft", to: "not published, any date", state: "derived" },
              {
                from: "Archive",
                to: "published, dated before today — a filter, not a status",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/org/index/components/archive.tsx",
                    start: 46,
                    code: `      const { data, error } = await supabase.from("events").select("*").eq("uuid", userUuid).eq("published", true).order("date", { ascending: true });

      if (error) {
        console.error("Error fetching events:", error);
      } else {
        const now = startOfDay(new Date());
        const filteredEvents = (data as Event[]).filter((event) => {
          const eventDate = parseISO(event.date);
          return isBefore(eventDate, now);
        });
        setEvents(filteredEvents);`,
                    why: "The same query as Ongoing with the comparison flipped. The archive-event edge function looks like it should do this; it is an untouched template.",
                  },
                ],
              },
              {
                from: "the trash icon",
                to: "deletes the row on one tap, no confirmation",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/org/index/components/ongoing.tsx",
                    start: 69,
                    code: `  const handleDeleteEvent = async (id: number) => {
    try {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) {
        console.error("Error deleting event:", error);
      } else {
        fetchEvents();
      }
    } catch (error) {
      console.error("Error deleting event:", error);
    }
  };`,
                    why: "A hard delete, and the RSVPs live inside the row — so every attendee's record goes with it, while their own `individual.rsvp` arrays keep the dead id.",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  /* ═══ 4. EVENT FEED ═══════════════════════════════════════════
     Five levels: the feed → the fetch → its phone cache → what the cache
     holds → the RSVP payload that put it there. */
  {
    id: "feed",
    title: "Event Feed",
    sub: "A student's home: nearest campus by GPS, that campus's upcoming events, ranked",
    footprint: {
      dirs: ["app/individual/index/", "lib/localStorage.ts"],
      files: 7,
    },
    group: { ordering: "sequence" },
    shape: { kind: "count", value: "61", unit: "campuses to pick the nearest from" },
    state: "derived",
    col: 0,
    row: 3,
    detail:
      "Campus is chosen first, then every published, upcoming event for it is fetched once and cached on the phone. Both home rows and search read that cache.",
    evidence: "app/individual/index/index.tsx:130",
    children: [
      {
        id: "fd-campus",
        title: "Campus Pick",
        sub: "GPS to the nearest of 61 hard-coded universities, or a manual drawer",
        footprint: { dirs: ["app/individual/index/index.tsx", "app/individual/index/components/universityList.tsx"], files: 3 },
        group: { ordering: "sequence" },
        shape: { kind: "marks", ids: ["expo"], note: "expo-location for the fix" },
        state: "derived",
        col: 0,
        row: 0,
        detail:
          "The campus is not saved anywhere: every launch asks for location again. The university list is a TypeScript array, not a table.",
        evidence: "app/individual/index/index.tsx:150",
        anatomy: [
          {
            kind: "flow",
            rows: [
              {
                n: 1,
                title: "Ask permission",
                detail: "Granted → nearest campus. Denied → an alert offering the manual drawer.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/individual/index/index.tsx",
                    start: 130,
                    code: `  const getLocationAndUniversity = async () => {
    if (isLocationManuallySet) return;

    let { status } = await Location.requestForegroundPermissionsAsync();
    setLocationPermission(status);

    if (status === "granted") {
      await getNearestUniversity();
    } else {
      Alert.alert(
        "Location Permission Denied",
        "Please enable location services to see events near you, or manually select your location.",
        [
          { text: "OK", onPress: () => showManualLocationSelector() },
          { text: "Try Again", onPress: () => getLocationAndUniversity() },
        ]
      );
    }
  };`,
                    why: "A manual pick only holds for the session — isLocationManuallySet is component state, so the next launch asks again.",
                  },
                ],
              },
              {
                n: 2,
                title: "Nearest campus",
                detail: "Great-circle distance to each of 61 universities; the smallest wins, however far.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/individual/index/index.tsx",
                    start: 150,
                    code: `  const getNearestUniversity = async () => {
    try {
      let location = await Location.getCurrentPositionAsync({});
      const userLat = location.coords.latitude;
      const userLon = location.coords.longitude;

      let nearest = universities[0];
      let minDistance = Number.MAX_VALUE;

      universities.forEach((uni) => {
        const distance = calculateDistance(userLat, userLon, uni.lat, uni.lon);
        if (distance < minDistance) {
          minDistance = distance;
          nearest = uni;
        }
      });

      setNearestUniversity(nearest.abbreviation);
      setCampus(nearest.name);
      refreshEvents(nearest.name);`,
                    why: "The header shows the abbreviation; the query uses the full name. calculateDistance is written out by hand here while the haversine-distance package, already a dependency, is used on the organisation side.",
                  },
                ],
              },
              { n: 3, title: "Fetch for it", detail: "refreshEvents(campus name) — see Event Fetch.", state: "derived" },
            ],
          },
        ],
      },
      {
        id: "fd-fetch",
        title: "Event Fetch",
        sub: "One query per campus, past days dropped, the result cached on the phone",
        footprint: { dirs: ["lib/localStorage.ts"], files: 1 },
        group: { ordering: "sequence" },
        state: "partial",
        alarm: true,
        col: 0,
        row: 1,
        detail:
          "fetchAllEvents selects every column of every published event on the campus — including the `rsvp` string, which holds every attendee's name and email.",
        evidence: "lib/localStorage.ts:42",
        anatomy: [
          {
            kind: "flow",
            rows: [
              {
                n: 1,
                title: "Query by campus",
                detail: "published = true and campus equal to the full university name.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/localStorage.ts",
                    start: 49,
                    code: `    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("published", true)
      .eq("campus", location)
      .order("date", { ascending: true });`,
                    why: "An exact string match. An event saved with no campus, or with an abbreviation, never appears to anyone.",
                  },
                ],
              },
              {
                n: 2,
                title: "Drop past days",
                detail: "Filtered on the phone, keeping today and later.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/localStorage.ts",
                    start: 65,
                    code: `    const now = startOfDay(new Date());
    const filteredEvents = data.filter((event) => {
      const eventDate = parseISO(event.date);
      return isAfter(eventDate, now) || isSameDay(eventDate, now);
    });

    return await storeData("events", filteredEvents);`,
                    why: "Past events are downloaded and then thrown away; the date filter could be in the query.",
                  },
                ],
              },
              {
                n: 3,
                title: "Cache it",
                detail: "Stored whole under the key \"events\" — and everything in the row comes with it.",
                state: "partial",
                under: [
                  {
                    kind: "map",
                    caption: "what lands on every student's phone",
                    rows: [
                      { from: "the event", to: "name, place, time, food, picture, organiser id", state: "derived" },
                      {
                        from: "rsvp",
                        to: "every attendee's full name, email, party size and dietary needs",
                        state: "partial",
                        under: [
                          {
                            kind: "source",
                            file: "app/individual/index/components/rsvpDrawer.tsx",
                            start: 155,
                            code: `        let rsvpJson = rsvp?.rsvp ? JSON.parse(rsvp?.rsvp) : {};

        rsvpJson[uuid] = {
          fullName: fullNameRef.current,
          email: emailRef.current,
          partySize: partySizeRef.current,
          dietaryRestrictions: dietaryRestrictionsRef.current.filter(
            (item) => item !== "Other"
          ),
        };`,
                            why: "This is what joining writes into the row. Because the feed selects *, any student who opens the app downloads the emails of everyone attending every event on their campus.",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "fd-ranked",
        title: "You Might Like",
        sub: "The top row: cached events scored on five rules, best eight shown",
        footprint: { dirs: ["app/individual/index/components/youmightlike.tsx"], files: 1 },
        group: { ordering: "set", note: "Five rules added into one score; none depends on another." },
        state: "partial",
        col: 0,
        row: 2,
        detail:
          "The only ranking in the app. Upcoming, the row below, is simply the first eight by date.",
        evidence: "app/individual/index/components/youmightlike.tsx:48",
        anatomy: [
          {
            kind: "map",
            caption: "rule → points",
            rows: [
              {
                from: "interests",
                to: "up to 5, by the share of your interests the event's categories match",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/individual/index/components/youmightlike.tsx",
                    start: 55,
                    code: `      const scoredEvents: EventScore[] = events
        .filter((event) => new Date(event.date) >= now)
        .map((event) => {
          let score = 0;
          const normalizedEventTypes = normalizeInterests(event.type);

          const matchingInterests = normalizedEventTypes.filter((type) => userInterests.includes(type));
          score += (matchingInterests.length / userInterests.length) * 5;`,
                    why: "The heaviest rule: up to 5 of a possible 13. Note the filter above it: a bare date parses as UTC midnight, which on a US phone is already past — so today's events never appear in this row.",
                  },
                ],
              },
              {
                from: "soon, popular, evening",
                to: "3/2/1 within 7/14/30 days; 2 for 10+ attendees, 1 for 5+; 1 if it starts 18:00–21:00",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/individual/index/components/youmightlike.tsx",
                    start: 64,
                    code: `          const daysUntilEvent = Math.floor((new Date(event.date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysUntilEvent <= 7) score += 3;
          else if (daysUntilEvent <= 14) score += 2;
          else if (daysUntilEvent <= 30) score += 1;

          const attendeeCount = event.rsvp ? Object.keys(JSON.parse(event.rsvp)).length : 0;
          if (attendeeCount >= 10) score += 2;
          else if (attendeeCount >= 5) score += 1;

          if (userLocation && event.location) {
            const sameCity = event.location.terms.some((term) => term.value.toLowerCase().includes(userLocation.city.toLowerCase()));
            if (sameCity) score += 2;
          }

          const eventHour = parseInt(event.time.split(":")[0]);
          if (eventHour >= 18 && eventHour <= 21) score += 1;`,
                    why: "Popularity counts RSVP keys, not heads — a party of four counts once. The same-city rule is the next row.",
                  },
                ],
              },
              {
                from: "same city",
                to: "2 points, read from user.location — which nothing in the app writes",
                state: "inferred",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "Reader", value: "youmightlike.tsx reads user.location.city", state: "derived" },
                      { label: "Writers", value: "None: no sign-up, profile edit or launch step sets a location on individual", state: "derived" },
                      { label: "So", value: "The rule is probably dead unless the column is filled outside the app", state: "inferred" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "fd-search",
        title: "Search",
        sub: "Text and category filters over the cached events, one organiser lookup per event",
        footprint: { dirs: ["app/individual/index/search.tsx"], files: 1 },
        state: "derived",
        col: 0,
        row: 3,
        detail:
          "Search never queries events — it filters the phone cache. Only the organiser names are fetched, one request each.",
        evidence: "app/individual/index/search.tsx:48",
        anatomy: [
          {
            kind: "map",
            caption: "what search reads",
            rows: [
              {
                from: "events",
                to: "the cache from Event Fetch, so only this campus, only upcoming",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/individual/index/search.tsx",
                    start: 48,
                    code: `  const fetchEvents = async () => {
    try {
      const eventsData = await retrieveData("events");
      const eventsWithOrganizers = await Promise.all(
        eventsData.map(async (event) => {
          const { data: organizationData } = await supabase.from("organizations").select("org_name").eq("id", event.uuid).single();
          return { ...event, organizer_name: organizationData?.org_name };
        })
      );
      setEvents(eventsWithOrganizers);
      setFilteredEvents(eventsWithOrganizers);`,
                    why: "An N+1: fifty cached events means fifty organisation queries every time the search screen gains focus. The organisation side has its own copy, app/org/index/search.tsx.",
                  },
                ],
              },
              { from: "categories", to: "the same eight values as sign-up", state: "derived" },
            ],
          },
        ],
      },
    ],
  },

  /* ═══ 5. RSVP ═════════════════════════════════════════════════
     Five levels: joining → button state → joinedEvents → after a restart →
     the source. */
  {
    id: "rsvp",
    title: "RSVP",
    sub: "Swipe up to join; the answer is written into one JSON string on the event",
    footprint: {
      dirs: ["app/individual/index/components/", "app/individual/index/eventdetails.tsx", "app/individual/saved/index.tsx"],
      files: 7,
    },
    group: { ordering: "set", note: "The gesture, where it writes, how it is undone, and what the buttons believe." },
    state: "partial",
    alarm: true,
    col: 0,
    row: 4,
    detail:
      "An RSVP is stored twice: as a key in the event's `rsvp` string, and as an id in the student's `rsvp` array. Every write is read-modify-write from the phone, and the cancel on the Saved tab cannot cancel.",
    evidence: "app/individual/index/components/rsvpDrawer.tsx:134",
    children: [
      {
        id: "rv-swipe",
        title: "Swipe To Join",
        sub: "A drawer for party size and dietary needs, confirmed by dragging up",
        footprint: { dirs: ["app/individual/index/components/rsvpDrawer.tsx", "app/individual/index/components/eventContext.tsx"], files: 2 },
        group: { ordering: "sequence" },
        state: "partial",
        col: 0,
        row: 0,
        detail:
          "The drawer is mounted once, at the app root, by EventProvider. Name and email are taken from the cached profile, not typed.",
        evidence: "app/individual/index/components/rsvpDrawer.tsx:302",
        anatomy: [
          {
            kind: "flow",
            rows: [
              { n: 1, title: "Join opens it", detail: "openRSVPDrawer(event) in the shared context; nothing is written yet.", state: "derived" },
              { n: 2, title: "Party and diet", detail: "Party size, and dietary chips: vegetarian, halal, gluten-free, dairy-free, vegan, peanut, other.", state: "derived" },
              {
                n: 3,
                title: "Drag past 50px",
                detail: "A drag of more than 50 points upward confirms; anything less springs back.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/individual/index/components/rsvpDrawer.tsx",
                    start: 315,
                    code: `      onPanResponderRelease: (_, gestureState) => {
        if (isSwipeDisabled || isKeyboardVisible) return;

        if (gestureState.dy < -50) {
          setIsSwipeDisabled(true);
          setShowConfirmation(true);

          Animated.timing(height, {
            toValue: Dimensions.get("window").height,
            duration: swipeAnimationDuration,
            useNativeDriver: false,
          }).start(() => {
            handleConfirm();
          });`,
                    why: "The write happens when the animation ends, not when the finger lifts.",
                  },
                ],
              },
              {
                n: 4,
                title: "Guards that never fire",
                detail: "The responder is built once, so it sees the first render's values forever.",
                state: "partial",
                under: [
                  {
                    kind: "source",
                    file: "app/individual/index/components/rsvpDrawer.tsx",
                    start: 302,
                    code: `  const confirmPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () =>
        !isSwipeDisabled && !isKeyboardVisible,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (isSwipeDisabled || isKeyboardVisible) return false;
        return gestureState.dy < -10;
      },`,
                    why: "useRef(...).current keeps the first PanResponder, whose closures captured isSwipeDisabled and isKeyboardVisible when both were false. The author worked around this for the form fields with refs, but not for the guards. Whether a second swipe is reachable depends on the confirmation overlay covering the handle — not determinable without running it.",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "rv-column",
        title: "RSVP Column",
        sub: "events.rsvp is a JSON string keyed by student id; four places rewrite it whole",
        footprint: { dirs: ["app/individual/index/components/rsvpDrawer.tsx", "app/org/index/attendees.tsx"], files: 4 },
        group: { ordering: "set", note: "The same fact, stored twice." },
        shape: { kind: "figure", id: "rsvp-writers", note: "Each writer reads, edits and saves the whole string; nothing locks it" },
        state: "partial",
        alarm: true,
        col: 0,
        row: 1,
        detail:
          "Two students joining the same event at the same moment both read the old string, each add themselves, and the later write erases the earlier one.",
        evidence: "app/individual/index/components/rsvpDrawer.tsx:145",
        anatomy: [
          {
            kind: "map",
            caption: "where an RSVP is recorded",
            rows: [
              {
                from: "events.rsvp",
                to: "{ studentId: { fullName, email, partySize, dietaryRestrictions } }, as text",
                state: "derived",
                under: [
                  {
                    kind: "flow",
                    rows: [
                      {
                        n: 1,
                        title: "Read the string",
                        detail: "Select rsvp for this event.",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "app/individual/index/components/rsvpDrawer.tsx",
                            start: 145,
                            code: `        const { data: rsvp, error: rsvpError } = await supabase
          .from("events")
          .select("rsvp")
          .eq("id", event.id)
          .single();`,
                            why: "The start of the race window. Nothing between this read and the write below stops another phone doing the same.",
                          },
                        ],
                      },
                      { n: 2, title: "Add yourself", detail: "Parse, set your key, keep everyone else's as read.", state: "derived" },
                      {
                        n: 3,
                        title: "Write it all back",
                        detail: "The whole string replaces the column.",
                        state: "partial",
                        under: [
                          {
                            kind: "source",
                            file: "app/individual/index/components/rsvpDrawer.tsx",
                            start: 166,
                            code: `        const { data: updateData, error: updateError } = await supabase
          .from("events")
          .update({ rsvp: JSON.stringify(rsvpJson) })
          .eq("id", event.id)
          .single();`,
                            why: "Last write wins. A student — not the organiser — is updating the event row here, so the database must allow students to update events at all.",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                from: "individual.rsvp",
                to: "an array of event ids — the same fact from the student's side",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/individual/index/components/rsvpDrawer.tsx",
                    start: 207,
                    code: `      const uniqueSavedEvents = new Set(existingSavedEvents.rsvp);
      uniqueSavedEvents.add(event.id);
      const updatedSavedEvents = Array.from(uniqueSavedEvents);

      const { data: updatedEvent, error: updateError } = await supabase
        .from("individual")
        .update({ rsvp: updatedSavedEvents })
        .eq("id", user.id)`,
                    why: "A second write after the first succeeds, with no transaction. If this one fails the error is only logged, and the two copies disagree. The variable names say \"saved events\"; the column is RSVPs.",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "rv-cancel",
        title: "Cancel",
        sub: "Undoing a join is written four times, and two copies disagree about the data",
        footprint: { dirs: ["app/individual/index/components/joinButton.tsx", "app/individual/index/eventdetails.tsx", "app/individual/saved/index.tsx"], files: 4 },
        group: { ordering: "set", note: "Four copies of one operation." },
        state: "partial",
        alarm: true,
        col: 0,
        row: 2,
        detail:
          "Two copies treat events.rsvp as the object it is. Two treat it as an array of ids — one of them is the Cancel on the Saved tab.",
        evidence: "app/individual/saved/index.tsx:114",
        anatomy: [
          {
            kind: "map",
            caption: "copy → what it assumes",
            rows: [
              {
                from: "joinButton.tsx",
                to: "an object: delete your key — correct",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/individual/index/components/joinButton.tsx",
                    start: 42,
                    code: `      // Parse and update RSVP data
      let rsvpData = eventData.rsvp ? JSON.parse(eventData.rsvp) : {};
      delete rsvpData[user.id]; // Remove the user from the RSVP data

      // Update event's RSVP data
      const { error: updateEventError } = await supabase
        .from("events")
        .update({ rsvp: JSON.stringify(rsvpData) })
        .eq("id", event.id);`,
                    why: "The shape the join writes. eventdetails.tsx:238 does the same, in parallel with the individual update.",
                  },
                ],
              },
              { from: "eventdetails.tsx", to: "an object — correct, both writes in Promise.all", state: "derived" },
              {
                from: "saved/index.tsx",
                to: "an array: calls .includes on an object, throws, cancels nothing",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/individual/saved/index.tsx",
                    start: 124,
                    code: `      let rsvpArray = currEvent.rsvp ? JSON.parse(currEvent.rsvp) : [];
      const userId = user.id;

      if (rsvpArray.includes(userId)) {
        rsvpArray = rsvpArray.filter((id) => id !== userId);
        await supabase
          .from("events")
          .update({ rsvp: JSON.stringify(rsvpArray) })
          .eq("id", event.id);
      }`,
                    why: "JSON.parse of the join's string yields an object, which has no .includes. The TypeError is caught and logged, so the button does nothing visible: the student stays on the attendee list and in their own list.",
                  },
                ],
              },
              { from: "rsvpEvents.tsx", to: "the same array assumption, in a component nothing imports", state: "derived" },
            ],
          },
        ],
      },
      {
        id: "rv-state",
        title: "Button State",
        sub: "Join and Save decide what to show from a list that starts empty every launch",
        footprint: { dirs: ["app/individual/index/components/"], files: 3 },
        group: { ordering: "set", note: "Two lists in one context, with the same flaw." },
        state: "partial",
        alarm: true,
        col: 0,
        row: 3,
        detail:
          "EventProvider holds joinedEvents and savedEvents in memory. Nothing loads them from the database, so after a restart every button shows its \"not yet\" face.",
        evidence: "app/individual/index/components/eventContext.tsx:17",
        anatomy: [
          {
            kind: "map",
            caption: "list → what goes wrong",
            rows: [
              {
                from: "joinedEvents",
                to: "starts empty and is only ever toggled",
                state: "derived",
                under: [
                  {
                    kind: "map",
                    caption: "the consequence",
                    rows: [
                      {
                        from: "after a restart",
                        to: "an event you joined shows Join; tapping it joins again",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "app/individual/index/components/joinButton.tsx",
                            start: 21,
                            code: `  const { joinedEvents, toggleJoined, openRSVPDrawer } = useEventContext();
  const isRSVPd = joinedEvents.includes(event.id);

  const handleJoin = () => {
    openRSVPDrawer(event); // Opens drawer but doesn't update state yet
  };`,
                            why: "Re-joining overwrites your own key in events.rsvp, so it is mostly harmless — but Cancel is unreachable from this button until you join again.",
                          },
                        ],
                      },
                      {
                        from: "where it starts",
                        to: "useState([]) in the provider at the app root",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "app/individual/index/components/eventContext.tsx",
                            start: 17,
                            code: `export const EventProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [savedEvents, setSavedEvents] = useState<number[]>([]);
  const [joinedEvents, setJoinedEvents] = useState<number[]>([]);
  const [isRSVPDrawerOpen, setIsRSVPDrawerOpen] = useState(false);
  const [currentEvent, setCurrentEvent] = useState<any | null>(null);

  const toggleSaved = (eventId: number) => {
    setSavedEvents((prev) =>
      prev.includes(eventId)
        ? prev.filter((id) => id !== eventId) // Remove event if already saved
        : [...prev, eventId] // Add event if not saved
    );
  };`,
                            why: "The database already holds both lists (individual.rsvp and individual.saved_events), and the home screen fetches them — into its own local state, not into this context.",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                from: "savedEvents",
                to: "same flaw; Save on a saved event appends a duplicate id",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/individual/index/components/saveButton.tsx",
                    start: 74,
                    code: `      let updatedSavedEvents: number[];
      if (isSaved) {
        // Remove event from saved list
        updatedSavedEvents = (data?.saved_events || []).filter(
          (id: number) => id !== eventId
        );
      } else {
        // Add event to saved list
        updatedSavedEvents = [...(data?.saved_events || []), eventId];
      }`,
                    why: "isSaved comes from the empty context, so the button always adds. Unlike the RSVP array this is a plain append, not a Set — the id goes in twice.",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  /* ═══ 6. CHECK-IN ═════════════════════════════════════════════
     Five levels: check-in → the tap → the snapshot it writes from → where
     the snapshot came from → the source. */
  {
    id: "check-in",
    title: "Check-In",
    sub: "An organisation's attendee list, a dietary tally, and a tap to mark someone arrived",
    footprint: {
      dirs: ["app/org/index/attendees.tsx", "app/org/index/eventdetails.tsx"],
      files: 3,
    },
    group: { ordering: "set", note: "What the organiser reads, and the one thing they write." },
    state: "partial",
    col: 0,
    row: 5,
    detail:
      "Everything here is parsed out of events.rsvp. Check-in adds a `checkedIn` flag to the attendee's entry — writing the whole string from a copy loaded screens earlier.",
    evidence: "app/org/index/attendees.tsx:97",
    children: [
      {
        id: "ci-list",
        title: "Attendee List",
        sub: "Names, emails, party sizes and a count of each dietary need",
        footprint: { dirs: ["app/org/index/attendees.tsx"], files: 1 },
        state: "derived",
        col: 0,
        row: 0,
        detail:
          "The headline count is the sum of party sizes, not the number of RSVPs.",
        evidence: "app/org/index/attendees.tsx:58",
        anatomy: [
          {
            kind: "map",
            caption: "read from the rsvp string",
            rows: [
              {
                from: "each attendee",
                to: "one entry per key, with checkedIn defaulting to false",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/org/index/attendees.tsx",
                    start: 72,
                    code: `    const parsedAttendees = Object.entries(rsvpData).map(
      ([uuid, data]: [string, any]) => ({
        ...data,
        uuid,
        checkedIn: data.checkedIn || false,
      })
    );
    setAttendees(parsedAttendees);

    // Count dietary restrictions
    const restrictionCounts: { [key: string]: number } = {};
    parsedAttendees.forEach((attendee) => {
      (attendee.dietaryRestrictions || []).forEach((restriction) => {
        restrictionCounts[restriction] =
          (restrictionCounts[restriction] || 0) + 1;
      });
    });

    // Create array of unique restrictions with counts
    const uniqueRestrictionsWithCounts = Object.entries(restrictionCounts).map(
      ([restriction, count]) => ({ restriction, count })
    );
    setUniqueDietaryRestrictions(uniqueRestrictionsWithCounts);`,
                    why: "The tally counts attendees, not plates: a party of four with one vegan counts as one vegan. Free-text \"Other\" restrictions are added as their own chips.",
                  },
                ],
              },
              { from: "the total", to: "the sum of partySize across entries", state: "derived" },
            ],
          },
        ],
      },
      {
        id: "ci-tap",
        title: "Check-In Tap",
        sub: "Toggle checkedIn on one entry and write the whole string back",
        footprint: { dirs: ["app/org/index/attendees.tsx", "app/org/index/eventdetails.tsx"], files: 3 },
        group: { ordering: "sequence" },
        state: "partial",
        alarm: true,
        col: 0,
        row: 1,
        detail:
          "Unlike the student side, this does not even re-read the column first. Anyone who joined after the organiser opened the dashboard is erased by the next check-in.",
        evidence: "app/org/index/attendees.tsx:97",
        anatomy: [
          {
            kind: "flow",
            rows: [
              {
                n: 1,
                title: "Start from a copy",
                detail: "The event arrives as a navigation parameter, not from the database.",
                state: "derived",
                under: [
                  {
                    kind: "map",
                    caption: "where the copy was loaded",
                    rows: [
                      {
                        from: "the dashboard",
                        to: "Ongoing selected the row; details passed it on; attendees keeps it",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "app/org/index/attendees.tsx",
                            start: 42,
                            code: `const AttendeesList = () => {
  const route = useRoute();
  const { event: initialEvent } = route.params as { event: Event };
  const [event, setEvent] = useState<Event>(initialEvent);`,
                            why: "eventdetails.tsx re-fetches rsvp for its own attendee preview, but navigates here with the original event object (eventdetails.tsx:200), so this screen starts from the dashboard's copy.",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              { n: 2, title: "Flip the flag", detail: "checkedIn = !checkedIn on that attendee's entry.", state: "derived" },
              {
                n: 3,
                title: "Write it all back",
                detail: "The edited copy replaces the column.",
                state: "partial",
                under: [
                  {
                    kind: "source",
                    file: "app/org/index/attendees.tsx",
                    start: 97,
                    code: `  const handleCheckIn = async (attendee: Attendee) => {
    try {
      const updatedRsvp = JSON.parse(event.rsvp);
      updatedRsvp[attendee.uuid].checkedIn = !attendee.checkedIn;

      const { data, error } = await supabase
        .from("events")
        .update({ rsvp: JSON.stringify(updatedRsvp) })
        .eq("id", event.id)
        .select();`,
                    why: "The returned row replaces the copy, so after the first tap the screen is current again — but that first write has already dropped any RSVP newer than the copy.",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  /* ═══ 7. ACCOUNT ══════════════════════════════════════════════
     Off the path. Five levels: account → delete → the student path →
     what the function removes → the source. */
  {
    id: "account",
    title: "Account",
    sub: "Sign out, reset a password, delete an account — each with a surprise",
    footprint: {
      dirs: ["app/(auth)/resetPassword.tsx", "app/individual/account/", "app/org/account/"],
      files: 4,
    },
    group: { ordering: "set", note: "Three unrelated actions on the account tab." },
    shape: { kind: "marks", ids: ["supabase"], note: "Supabase Auth and one edge function" },
    state: "partial",
    alarm: true,
    col: 1,
    row: 0,
    detail:
      "Deleting an organisation calls an edge function that is not in this repository. Resetting an organisation's password also writes the new password, in plain text, into the organizations table.",
    evidence: "app/org/account/index.tsx:142, app/(auth)/resetPassword.tsx:157",
    children: [
      {
        id: "ac-reset",
        title: "Password Reset",
        sub: "Email lookup, a recovery code, a new password — and a plain-text copy",
        footprint: { dirs: ["app/(auth)/resetPassword.tsx"], files: 1 },
        group: { ordering: "sequence" },
        state: "partial",
        alarm: true,
        col: 0,
        row: 0,
        detail:
          "Shared by both account types; it decides which one you are by looking your email up before you are signed in.",
        evidence: "app/(auth)/resetPassword.tsx:35",
        anatomy: [
          {
            kind: "flow",
            rows: [
              {
                n: 1,
                title: "Look up the email",
                detail: "Queries individual, then organizations, by email — while signed out.",
                state: "partial",
                under: [
                  {
                    kind: "source",
                    file: "app/(auth)/resetPassword.tsx",
                    start: 35,
                    code: `  async function checkUserExists(email) {
    try {
      // First check individual accounts
      const { data: individualData, error: individualError } = await supabase
        .from("individual")
        .select("email")
        .eq("email", email)
        .single();

      if (individualError && individualError.code !== "PGRST116") {
        throw individualError;
      }

      if (individualData) {
        setAccountType("individual");
        return true;
      }`,
                    why: "This only works if an anonymous caller may read both profile tables. If it does work, anyone can test whether an email has an account. The policies that decide it are not in this repo.",
                  },
                ],
              },
              { n: 2, title: "Send a code", detail: "resetPasswordForEmail, with redirectTo \"yourapp://reset-password\" — a placeholder scheme; the app's is explorify://.", state: "derived" },
              { n: 3, title: "Verify and set", detail: "verifyOtp(type \"recovery\") signs the user in; updateUser sets the password.", state: "derived" },
              {
                n: 4,
                title: "Plain-text copy",
                detail: "For organisations only, the new password is also written to organizations.password.",
                state: "partial",
                under: [
                  {
                    kind: "source",
                    file: "app/(auth)/resetPassword.tsx",
                    start: 157,
                    code: `      // Update the password in the corresponding table based on account type
      if (accountType === "organizations") {
        const { error: orgUpdateError } = await supabase
          .from("organizations")
          .update({ password: newPassword })
          .eq("email", email);

        if (orgUpdateError) {
          console.error(
            "Error updating organization password:",
            orgUpdateError
          );
          // Continue anyway since auth password is updated
        }
      }`,
                    why: "Supabase Auth already stores a hash; this is a second, readable copy. If the column does not exist the error is swallowed, so whether passwords are actually sitting in the table cannot be told from the repo — only that the code tries.",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "ac-delete",
        title: "Delete Account",
        sub: "Both account types call an edge function; only one of the two functions exists",
        footprint: { dirs: ["app/individual/account/index.tsx", "app/org/account/index.tsx", "supabase/functions/"], files: 3 },
        group: { ordering: "set", note: "The same button on each side, two different functions." },
        state: "partial",
        alarm: true,
        col: 0,
        row: 1,
        detail:
          "A client cannot delete its own auth user, so deletion goes through a function holding the service-role key.",
        evidence: "app/individual/account/index.tsx:125",
        anatomy: [
          {
            kind: "map",
            caption: "account type → function called",
            rows: [
              {
                from: "student",
                to: "delete-user, with its own id in the body",
                state: "derived",
                under: [
                  {
                    kind: "flow",
                    rows: [
                      {
                        n: 1,
                        title: "Invoke",
                        detail: "The app sends { userId } — the function trusts it.",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "app/individual/account/index.tsx",
                            start: 125,
                            code: `      const { error: deleteUserError } = await supabase.functions.invoke(
        "delete-user",
        {
          body: { userId: user.id },
        }
      );

      if (deleteUserError) throw deleteUserError;

      // Sign out the user
      await supabase.auth.signOut();

      // Clear local storage
      await AsyncStorage.clear();`,
                            why: "The id is chosen by the client. See Server Code for why the function should take it from the caller's token instead.",
                          },
                        ],
                      },
                      {
                        n: 2,
                        title: "Profile, then auth user",
                        detail: "The individual row goes first, then the auth user.",
                        state: "partial",
                        under: [
                          {
                            kind: "source",
                            file: "supabase/functions/delete-user/index.ts",
                            start: 21,
                            code: `    // Delete from individual table first
    const { error: deleteError } = await supabaseAdmin
      .from("individual")
      .delete()
      .eq("id", userId);

    if (deleteError) {
      throw deleteError;
    }

    // Then delete the user
    const { error: deleteUserError } =
      await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      throw deleteUserError;
    }`,
                            why: "Nothing touches events.rsvp, so the deleted student's name, email and dietary needs stay inside every event they joined.",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                from: "organisation",
                to: "delete-organization — which is not in supabase/functions/",
                state: "partial",
                under: [
                  {
                    kind: "source",
                    file: "app/org/account/index.tsx",
                    start: 142,
                    code: `      const { error: deleteOrgError } = await supabase.functions.invoke(
        "delete-organization",
        {
          body: { userId: user.id },
        }
      );

      if (deleteOrgError) throw deleteOrgError;`,
                    why: "Only archive-event and delete-user are in the repo. If delete-organization was never deployed, this returns an error and the organisation sees \"try again\" forever; if it was deployed from elsewhere, its code is not reviewable here.",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "ac-signout",
        title: "Sign Out",
        sub: "Wipe the phone's storage, then tell Supabase",
        footprint: { dirs: ["app/individual/account/index.tsx", "app/org/account/index.tsx"], files: 2 },
        state: "inferred",
        col: 0,
        row: 2,
        detail:
          "Both account tabs carry the same function. The order may matter: the session itself lives in that storage.",
        evidence: "app/individual/account/index.tsx:69",
        anatomy: [
          {
            kind: "map",
            caption: "the two steps",
            rows: [
              {
                from: "AsyncStorage.clear()",
                to: "first — removing the cached profile, and the Supabase session with it",
                state: "inferred",
                under: [
                  {
                    kind: "source",
                    file: "app/individual/account/index.tsx",
                    start: 69,
                    code: `  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await AsyncStorage.clear();
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Error during sign out:", error);
    } finally {
      setIsSigningOut(false);
    }
  };`,
                    why: "lib/supabase.ts tells the client to persist its session in AsyncStorage. Clearing it first may leave signOut without a stored session to revoke, so the refresh token could outlive the sign-out. Not verifiable without running it.",
                  },
                ],
              },
              { from: "signOut()", to: "second; the tab has already started routing to / as soon as signing out began", state: "derived" },
            ],
          },
        ],
      },
    ],
  },

  /* ═══ 8. SUPABASE ═════════════════════════════════════════════
     Off the path: the floor every root stands on. Five levels: Supabase →
     what is missing → row-level security → what the app needs → the source. */
  {
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
  },

  /* ═══ 9. SERVER CODE ══════════════════════════════════════════
     Off the path. Five levels: server code → delete-user → who may call it →
     the trust decision → the source. */
  {
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
  },
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
