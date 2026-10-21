import type { Node } from "@/lib/data";
/* ═══ 2. LAUNCH ROUTING ═══════════════════════════════════════
   Five levels: routing → the check written three times → the index.tsx
   copy → its four steps → the undefined variable. */
export const launch: Node = {
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
};
