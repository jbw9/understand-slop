import type { Node } from "@/lib/data";
/* ═══ 1. SIGN UP ═══════════════════════════════════════════════
   Five levels: the wizard → its five stages → the email stage → the
   throwaway password it invents → the source. */
export const signup: Node = {
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
      detail: `Every student and every event is tagged from one fixed list of eight categories. A student picks 2 to 5 when signing up — these become their interests. An organisation picks 2 to 5 that describe it, and tags each event it creates with at least one.

The feed ranks events by overlap: the more of an event's categories appear in a student's interests, the higher it sits in "You Might Like". Both search screens use the same list as filter buttons.

Only the stored value is ever compared — the lowercase words in the second column below. The label with the emoji is just what the screen shows.`,
      code: [
        { file: "app/individual/index/data/categories.ts", start: 1, end: 10, label: "The list itself" },
        { file: "app/(auth)/registerIndividual.tsx", start: 177, end: 184, label: "Picking interests: a sixth tap is ignored" },
        { file: "app/(auth)/registerIndividual.tsx", start: 411, end: 416, label: "Continue stays grey until two are picked" },
        { file: "app/individual/index/components/youmightlike.tsx", start: 57, end: 60, label: "Scoring an event by how many categories match" },
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
  ],
};
