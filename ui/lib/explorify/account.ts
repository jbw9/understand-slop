import type { Node } from "@/lib/data";
/* ═══ 7. YOUR ACCOUNT ══════════════════════════════════════════
   Off the path. The Account tab both kinds of user share: editing the
   profile and its photo, resetting a password, signing out, and deleting
   the account through a server function. */
export const account: Node = {
  id: "account",
  title: "Your Account",
  sub: "The Account tab: edit your profile, reset your password, sign out or delete the account.",
  footprint: {
    dirs: ["app/individual/account/", "app/org/account/", "app/(auth)/resetPassword.tsx", "supabase/functions/delete-user/"],
    files: 7,
  },
  shape: { kind: "marks", ids: ["supabase"], note: "Supabase Auth, Storage and one Edge Function" },
  state: "partial",
  unsure:
    "Deleting an organisation calls a Supabase Edge Function named `delete-organization` that is not in `supabase/functions/`. It may have been deployed from somewhere else, or may not exist at all; the repo cannot say which.",
  col: 1,
  row: 0,
  detail: `Students and organisations each have an Account tab (\`app/individual/account/index.tsx\`, \`app/org/account/index.tsx\`). They are near copies: a round photo and the name at the top, Edit Profile, then Reset password and Delete account under Settings, two Support links that open the same Google Form, and Sign Out at the bottom.

The name and photo come from the profile copy saved on the phone (\`user\`), not from the database. Edit Profile and the photo write to the database directly; Reset password opens a shared screen that also serves the login page; Delete account asks a Supabase Edge Function to do what the app itself is not allowed to do — remove the login account.

The two tabs differ where it matters: an organisation's delete calls a function that is not in this repository, and an organisation's password reset also writes the new password, readable, into the \`organizations\` table.`,
  code: [
    { file: "app/individual/account/index.tsx", start: 168, end: 275, label: "What the student Account tab shows" },
    { file: "app/individual/account/index.tsx", start: 51, end: 59, label: "Name and photo come from the phone's copy" },
    { file: "app/individual/account/index.tsx", start: 61, end: 67, label: "Feedback and Report an issue open the same form" },
    { file: "app/org/account/index.tsx", start: 51, end: 75, label: "The organisation tab waits for the copy" },
  ],
  anatomy: [
    {
      kind: "screen",
      title: "Account tab",
      caption: "The student tab; the organisation tab is the same with its own name and \"Organization Settings\"",
      items: [
        { type: "image", label: "Profile photo", note: "tap to pick a new one (see Profile Photo)" },
        { type: "heading", label: "Your name", note: "full_name — or org_name — from the phone's copy of the profile" },
        { type: "button", label: "Edit Profile", note: "slides up the edit drawer" },
        { type: "text", label: "Settings" },
        { type: "list", label: "🔒 Reset password", note: "opens the shared reset screen" },
        { type: "list", label: "🗑️ Delete account", note: "asks to confirm, then calls an Edge Function" },
        { type: "text", label: "Support" },
        { type: "list", label: "💬 Feedback", note: "opens a Google Form" },
        { type: "list", label: "📢 Report an issue", note: "opens the same Google Form" },
        { type: "button", label: "Sign Out", note: "clears the phone, then signs out" },
      ],
    },
    {
      kind: "diagram",
      caption: "Where each action on the tab goes",
      boxes: [
        { id: "tab", label: "Account tab", col: 0, row: 2 },
        { id: "edit", label: "Edit Profile", sub: "drawer", col: 1, row: 0 },
        { id: "reset", label: "Reset password", sub: "shared screen", col: 1, row: 1 },
        { id: "del", label: "Delete account", sub: "confirm alert", col: 1, row: 2 },
        { id: "out", label: "Sign Out", col: 1, row: 4 },
        { id: "profile", label: "Profile row", sub: "individual / organizations", col: 2, row: 0 },
        { id: "auth", label: "Supabase Auth", sub: "code, new password", col: 2, row: 1 },
        { id: "fnS", label: "delete-user", sub: "Edge Function", col: 2, row: 2 },
        { id: "fnO", label: "delete-organization", sub: "not in this repo", col: 2, row: 3, tone: "warn" },
        { id: "store", label: "Phone storage", sub: "cleared", col: 2, row: 4 },
      ],
      arrows: [
        { from: "tab", to: "edit" },
        { from: "tab", to: "reset" },
        { from: "tab", to: "del" },
        { from: "tab", to: "out" },
        { from: "edit", to: "profile", label: "saves" },
        { from: "reset", to: "auth" },
        { from: "del", to: "fnS", label: "students" },
        { from: "del", to: "fnO", label: "organisations", tone: "warn" },
        { from: "out", to: "store" },
      ],
    },
  ],
  children: [
    {
      id: "ac-profile",
      title: "Editing Your Profile",
      sub: "A drawer that lets a student change their interests and an organisation change its contact details.",
      footprint: { dirs: ["app/individual/account/components/EditProfileDrawer.tsx", "app/org/account/components/EditProfileDrawer.tsx"], files: 2 },
      state: "derived",
      col: 0,
      row: 0,
      detail: `Edit Profile slides up a drawer, filled from the phone's copy of the profile. The two kinds of account get different drawers: a student can change only their photo and interests (still at most 5); an organisation can change its photo, bio, contact name, contact email, website and Instagram. Names and login emails cannot be changed anywhere in the app.

Save sends one \`update\` to the profile table for the signed-in id and closes the drawer. It never looks at the result: Supabase reports a failure as a returned error rather than by throwing, so the "Failed to save profile" alert can never appear, and a failed save looks exactly like a successful one.

Save also does not refresh the phone's copy (\`user\`), and every other screen reads that copy. For a student, the new interests are in the database but You Might Like keeps ranking by the old ones until the app is next opened.`,
      code: [
        { file: "app/individual/account/components/EditProfileDrawer.tsx", start: 46, end: 63, label: "Fill the drawer from the phone's copy" },
        { file: "app/individual/account/components/EditProfileDrawer.tsx", start: 104, end: 124, label: "Student save: interests only, result never checked" },
        { file: "app/individual/account/components/EditProfileDrawer.tsx", start: 170, end: 209, label: "Interest buttons, at most 5" },
        { file: "app/org/account/components/EditProfileDrawer.tsx", start: 106, end: 130, label: "Organisation save: five text fields" },
        { file: "app/org/account/components/EditProfileDrawer.tsx", start: 183, end: 219, label: "Organisation drawer fields" },
      ],
      anatomy: [
        {
          kind: "table",
          caption: "What each drawer can change",
          columns: ["Field", "Student", "Organisation", "Saved to"],
          state: "derived",
          rows: [
            ["Profile photo", "yes", "yes", "avatar_url (see Profile Photo)"],
            ["Interests", "yes, 0 to 5", "no", "individual.interests"],
            ["Bio", "no", "yes", "organizations.bio"],
            ["Contact name", "no", "yes", "organizations.contact_name"],
            ["Contact email", "no", "yes", "organizations.contact_email"],
            ["Website", "no", "yes", "organizations.website"],
            ["Instagram", "no", "yes", "organizations.instagram"],
            ["Name, login email", "no", "no", "—"],
          ],
        },
        {
          kind: "screen",
          title: "Edit Profile (student)",
          items: [
            { type: "heading", label: "Edit Profile" },
            { type: "image", label: "Profile photo", note: "tap to replace it" },
            { type: "text", label: "Interests" },
            { type: "choice", label: "STEM 🔬", note: "the 8 categories; tap to add or remove" },
            { type: "choice", label: "Social 👫" },
            { type: "text", label: "Maximum of 5 interests can be selected", note: "in red, once 5 are chosen" },
            { type: "button", label: "Save", note: "updates individual.interests and closes" },
          ],
        },
      ],
      issues: [
        {
          title: "Save never reports a failure",
          detail:
            "Both drawers ignore the error Supabase returns, so a save that the database rejected closes the drawer as if it worked.",
          where: "app/individual/account/components/EditProfileDrawer.tsx:106",
        },
        {
          title: "New interests ignored until reopening",
          detail:
            "The drawer does not update the cached `user`, which You Might Like reads, so a student's ranking only changes after the next launch.",
          where: "app/individual/account/components/EditProfileDrawer.tsx:114",
        },
        {
          title: "A student can save zero interests",
          detail:
            "Sign-up demands at least 2, but the drawer lets every one be unticked. You Might Like divides by the number of interests, so with none every event scores \"not a number\" and the ranking has no meaning.",
          where: "app/individual/index/components/youmightlike.tsx:62",
        },
      ],
      children: [
        {
          id: "ac-photo",
          title: "Profile Photo",
          sub: "Tapping the round photo picks an image, uploads it to storage and points the profile at it.",
          footprint: { dirs: ["app/individual/account/components/UploadAvatar.tsx"], files: 1 },
          state: "derived",
          col: 0,
          row: 0,
          detail: `The round photo on the Account tab and in the edit drawer is one shared component, \`UploadAvatar.tsx\`, used by both kinds of account. Tapping it opens the phone's photo library with cropping on. The chosen image is uploaded to the Supabase Storage bucket \`user_avatar\` under a new name: \`individual_\` or \`organization_\`, the current time in milliseconds, and the file's extension.

The new name is then saved in the profile's \`avatar_url\` column. To show a photo, the app asks the bucket for that file's public web address, so anyone with the address can view it.

Only a student's phone copy of the profile is updated with the new \`avatar_url\`. An organisation's home screen keeps showing the old photo until the next launch. Old photos are never deleted from the bucket.`,
          code: [
            { file: "app/individual/account/components/UploadAvatar.tsx", start: 84, end: 133, label: "Pick, upload, save" },
            { file: "app/individual/account/components/UploadAvatar.tsx", start: 54, end: 82, label: "Save avatar_url; update the phone copy for students only" },
            { file: "app/individual/account/components/UploadAvatar.tsx", start: 39, end: 52, label: "Show it from a public address" },
          ],
          anatomy: [
            {
              kind: "sequence",
              caption: "A new profile photo",
              actors: ["Phone", "Photo library", "Storage bucket", "Profile table"],
              rows: [
                { from: "Phone", to: "Photo library", label: "pick one image, cropped", state: "derived" },
                { from: "Photo library", to: "Phone", label: "the image", state: "derived" },
                { from: "Phone", to: "Storage bucket", label: "upload as individual_1712….jpg", state: "derived" },
                { from: "Phone", to: "Profile table", label: "set avatar_url to that name", state: "derived" },
                { from: "Phone", to: "Phone", label: "students only: update cached \"user\"", state: "derived" },
                { from: "Phone", to: "Storage bucket", label: "public address of the file", state: "derived" },
              ],
            },
            {
              kind: "example",
              caption: "What gets stored (example value)",
              value: `avatar_url = "individual_1712345678901.jpg"`,
              notes: [
                { label: "Bucket", value: "user_avatar", state: "derived" },
                { label: "Shown from", value: "the bucket's public URL for that name", state: "derived" },
              ],
            },
          ],
          issues: [
            {
              title: "Organisation photo looks unchanged",
              detail:
                "The phone copy is updated only for students, so an organisation's home screen shows the old photo until the app is reopened.",
              where: "app/individual/account/components/UploadAvatar.tsx:56",
            },
            {
              title: "Old photos pile up",
              detail: "Each upload gets a new name and nothing deletes the previous file from the bucket.",
              where: "app/individual/account/components/UploadAvatar.tsx:115",
            },
            {
              title: "Upload failures are silent",
              detail: "Any failure is only logged. The spinner stops and the old photo stays, with no message to the user.",
              where: "app/individual/account/components/UploadAvatar.tsx:128",
            },
          ],
        },
      ],
    },
    {
      id: "ac-reset",
      title: "Resetting A Password",
      sub: "A two-step screen: an email first, then the emailed code and a new password together.",
      footprint: { dirs: ["app/(auth)/resetPassword.tsx"], files: 1 },
      state: "partial",
      unsure:
        "Step 1 reads the `individual` and `organizations` tables before anyone is signed in. Whether the database allows that is decided by row-level security rules kept in the Supabase dashboard, not in this repo; if it does not, every reset ends at \"No account found\". Whether `organizations` really has a `password` column is not visible here either, because a failed write is ignored.",
      col: 0,
      row: 1,
      detail: `Reached from Forgot password on the login screen and from Reset password on either Account tab. Step 1 takes an email and looks for it in \`individual\` and then \`organizations\`, to learn which kind of account it is. Only if it is found does it ask Supabase Auth to email a recovery code.

Step 2 takes the code and a new password together. \`verifyOtp\` with type \`recovery\` checks the code and signs the person in, and \`updateUser\` sets the new password. For organisations the new password is also written into \`organizations.password\` — a second, readable copy beside the scrambled one Supabase Auth keeps. Then it shows "Password has been reset successfully" and opens the login screen.

The email is matched exactly as typed, with no trimming or lower-casing, and the new password is not checked against the sign-up rule.`,
      code: [
        { file: "app/(auth)/resetPassword.tsx", start: 35, end: 75, label: "Step 1: which table has this email?" },
        { file: "app/(auth)/resetPassword.tsx", start: 77, end: 111, label: "Step 1: send the recovery email" },
        { file: "app/(auth)/resetPassword.tsx", start: 113, end: 180, label: "Step 2: check the code, set the password" },
        { file: "app/(auth)/resetPassword.tsx", start: 157, end: 171, label: "Organisations: the readable copy" },
        { file: "app/(auth)/resetPassword.tsx", start: 194, end: 273, label: "What the two steps show" },
        { file: "app.json", start: 8, end: 8, label: "The app's real link scheme" },
      ],
      anatomy: [
        {
          kind: "sequence",
          caption: "An organisation resetting its password",
          actors: ["Phone", "Database", "Supabase Auth", "Email inbox"],
          rows: [
            { from: "Phone", to: "Database", label: "email in individual? organizations?", state: "partial" },
            { from: "Database", to: "Phone", label: "found in organizations", state: "partial" },
            { from: "Phone", to: "Supabase Auth", label: "send a recovery email", state: "derived" },
            { from: "Supabase Auth", to: "Email inbox", label: "a code", note: "depends on the email template", state: "partial" },
            { from: "Phone", to: "Supabase Auth", label: "code, type \"recovery\"", state: "derived" },
            { from: "Supabase Auth", to: "Phone", label: "signed in", state: "derived" },
            { from: "Phone", to: "Supabase Auth", label: "set the new password", state: "derived" },
            { from: "Phone", to: "Database", label: "organizations.password = new password", note: "readable copy", state: "derived" },
          ],
        },
        {
          kind: "screen",
          title: "Step 1 of 2",
          items: [
            { type: "heading", label: "What's your email address?" },
            { type: "field", label: "Email", note: "matched exactly as typed" },
            { type: "button", label: "Send OTP", note: "grey until something is typed; \"No account found with this email\" if neither table has it" },
          ],
        },
        {
          kind: "screen",
          title: "Step 2 of 2",
          items: [
            { type: "heading", label: "Enter OTP and New Password" },
            { type: "field", label: "Enter OTP code", note: "number pad, no length limit" },
            { type: "field", label: "New Password", note: "hidden; no rule is checked" },
            { type: "button", label: "Reset Password", note: "grey until both are filled; then opens login" },
          ],
        },
      ],
      issues: [
        {
          title: "Organisation passwords stored readable",
          detail:
            "After a reset, an organisation's new password is written as plain text into `organizations.password`. Anyone who can read that table can read it. Students are not affected.",
          where: "app/(auth)/resetPassword.tsx:158",
        },
        {
          title: "Anyone can test whether an email is registered",
          detail:
            "For this screen to work, signed-out visitors must be able to read emails from both profile tables — and then \"No account found\" tells anyone whether an address has an account.",
          where: "app/(auth)/resetPassword.tsx:35",
        },
        {
          title: "Placeholder link address",
          detail:
            "The recovery email is told to link back to `yourapp://reset-password`, while the app's own scheme is `explorify://`. Harmless while the email carries a code, but a link in it would not open the app.",
          where: "app/(auth)/resetPassword.tsx:97",
        },
        {
          title: "Still signed in after a reset",
          detail:
            "The recovery code signs the person in, and the screen then opens login without signing out. The next time the app opens, the launch check finds them signed in and skips login.",
          where: "app/(auth)/resetPassword.tsx:174",
        },
      ],
    },
    {
      id: "ac-signout",
      title: "Signing Out",
      sub: "Wipes everything the app saved on the phone, then tells Supabase to end the session.",
      footprint: { dirs: ["app/individual/account/index.tsx", "app/org/account/index.tsx"], files: 2 },
      state: "partial",
      unsure:
        "What happens on Supabase's side depends on the supabase-js library, which is not part of this repo. With the saved session already wiped, `signOut` may have no session left to end, so the session could stay valid on the server until it expires. Whether the opening screen's launch check runs before or after the wipe is also a matter of timing.",
      col: 0,
      row: 2,
      detail: `Both Account tabs have the same \`handleSignOut\`. It first sets a "signing out" flag, which immediately swaps the tab for a spinner and sends the app to the opening screen \`/\`. Then it clears all of phone storage with \`AsyncStorage.clear()\`, and only then calls \`supabase.auth.signOut()\`.

Clearing storage removes everything at once: the cached \`user\`, \`uuid\` and \`events\`, and also the Supabase login session, because the Supabase client keeps its session in that same storage. The opening screen runs the launch check again and, finding no session, sends the person to login.

The order is the reverse of Delete account, which signs out first and clears storage second. Errors while signing out are only logged.`,
      code: [
        { file: "app/individual/account/index.tsx", start: 69, end: 79, label: "Sign out: clear the phone, then sign out" },
        { file: "app/individual/account/index.tsx", start: 45, end: 49, label: "Going to / as soon as it starts" },
        { file: "app/org/account/index.tsx", start: 84, end: 94, label: "The organisation copy" },
        { file: "lib/supabase.ts", start: 9, end: 16, label: "The session lives in the same phone storage" },
      ],
      anatomy: [
        {
          kind: "flow",
          rows: [
            { n: 1, title: "Spinner, then the opening screen", detail: "Setting the flag swaps the tab for a spinner and opens `/`.", state: "derived" },
            { n: 2, title: "Clear phone storage", detail: "Every key, including the Supabase session.", state: "derived" },
            { n: 3, title: "Sign out of Supabase", detail: "With the saved session already gone, there may be nothing left for it to end.", state: "inferred" },
            { n: 4, title: "Back to login", detail: "The opening screen's launch check finds no one signed in.", state: "inferred" },
          ],
        },
      ],
    },
    {
      id: "ac-delete",
      title: "Deleting An Account",
      sub: "After a confirmation, the app asks a server function to delete the account; organisations call one that is missing.",
      footprint: { dirs: ["app/individual/account/index.tsx", "app/org/account/index.tsx", "supabase/functions/delete-user/index.ts"], files: 3 },
      state: "partial",
      unsure:
        "`delete-organization` is not in `supabase/functions/`. If it was deployed to the Supabase project from elsewhere it may work; if not, every organisation delete fails.",
      col: 0,
      row: 3,
      detail: `The app cannot delete a Supabase login account by itself — that needs the project's secret service-role key, which must never ship inside an app. So Delete account, after an "irreversible" confirmation, calls a Supabase Edge Function — a small script that runs on Supabase's servers with that key. The app also puts the account id in the request body.

Students call \`delete-user\`, which is in this repo (see Account Deletion Function under Server Code). Since commit 304a512 it ignores the id in the body — before that fix it trusted it, so anyone could delete any account: it asks Supabase Auth whose session token came with the call (a call with none gets "Unauthorized"), then deletes that person's \`individual\` row, then their login account, and replies with success. The app then signs out, clears phone storage, shows "Account Deleted" and returns to the opening screen. Organisations call \`delete-organization\`, which is not in this repo (see Missing Organisation Delete under Server Code); when it fails they see "There was an error deleting your organization. Please try again."

So a student can only ever delete themselves. But the function removes only the profile row and the login: copies of the student's name, email, party size and dietary needs inside every event they joined stay where they are.`,
      code: [
        { file: "app/individual/account/index.tsx", start: 93, end: 109, label: "The confirmation" },
        { file: "app/individual/account/index.tsx", start: 111, end: 162, label: "Student delete: call delete-user, sign out, clear" },
        { file: "app/org/account/index.tsx", start: 129, end: 169, label: "Organisation delete: call delete-organization" },
        { file: "supabase/functions/delete-user/index.ts", start: 15, end: 29, label: "delete-user: whose token is this?" },
        { file: "supabase/functions/delete-user/index.ts", start: 31, end: 47, label: "delete-user: profile row, then login" },
      ],
      anatomy: [
        {
          kind: "map",
          caption: "Who calls what",
          rows: [
            { from: "student", to: "delete-user — in supabase/functions/; deletes the profile row, then the login", state: "derived" },
            { from: "organisation", to: "delete-organization — not in this repo", state: "partial" },
          ],
        },
        {
          kind: "sequence",
          caption: "A student deleting their account",
          actors: ["Phone", "Supabase Auth", "delete-user", "Database"],
          rows: [
            { from: "Phone", to: "Supabase Auth", label: "who am I?", state: "derived" },
            { from: "Supabase Auth", to: "Phone", label: "the account id", state: "derived" },
            { from: "Phone", to: "delete-user", label: "{ userId } + session token", state: "derived" },
            { from: "delete-user", to: "Supabase Auth", label: "whose token is this?", note: "the body's id is ignored", state: "derived" },
            { from: "delete-user", to: "Database", label: "delete the individual row", state: "derived" },
            { from: "delete-user", to: "Supabase Auth", label: "delete the login", state: "derived" },
            { from: "delete-user", to: "Phone", label: "success", state: "derived" },
            { from: "Phone", to: "Phone", label: "sign out, clear storage, go to /", state: "derived" },
          ],
        },
        {
          kind: "table",
          caption: "What a student's delete removes, and what it leaves",
          columns: ["Data", "After delete"],
          state: "derived",
          rows: [
            ["individual row (name, email, interests…)", "deleted"],
            ["Supabase login account", "deleted"],
            ["Phone storage", "cleared"],
            ["RSVP entries inside events.rsvp (name, email, party size, dietary needs)", "stay"],
            ["Profile photo in the user_avatar bucket", "stays"],
          ],
        },
      ],
      issues: [
        {
          title: "Organisation delete calls a missing function",
          detail:
            "Only `delete-user` and `archive-event` are in the repo. If `delete-organization` was never deployed, organisations can never delete themselves and only ever see \"Please try again\".",
          where: "app/org/account/index.tsx:143",
        },
        {
          title: "Joined events keep the student's details",
          detail:
            "Deleting a student does not touch `events.rsvp`, so their name, email, party size and dietary needs stay in every event they joined and still appear on organisers' attendee lists.",
          where: "supabase/functions/delete-user/index.ts:31",
        },
      ],
    },
  ],
};
