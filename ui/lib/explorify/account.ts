import type { Node } from "@/lib/data";
/* ═══ 7. ACCOUNT ══════════════════════════════════════════════
   Off the path. Five levels: account → delete → the student path →
   what the function removes → the source. */
export const account: Node = {
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
};
