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
  detail: "Students and organisations each have a near-identical Account tab. Its name and photo come from the profile copy on the phone, and each row on it leads to one of the pages here.",
  code: [
    { file: "app/individual/account/index.tsx", start: 168, end: 275, label: "What the student Account tab shows" },
    { file: "app/individual/account/index.tsx", start: 51, end: 59, label: "Name and photo come from the phone's copy" },
    { file: "app/individual/account/index.tsx", start: 39, end: 43, label: "Read again every time the tab opens" },
    { file: "app/individual/account/index.tsx", start: 61, end: 67, label: "Feedback and Report an issue open the same form" },
    { file: "app/org/account/index.tsx", start: 51, end: 75, label: "The organisation tab waits for the copy" },
  ],
  anatomy: [
    {
      kind: "screen",
      title: "Account tab (student)",
      caption: "A student's Account tab, before any photo is chosen",
      shot: "/shots/explorify/account.png",
      items: [
        { type: "image", label: "Profile photo", note: "a placeholder until one is chosen; tap to pick one (see Profile Photo)" },
        { type: "heading", label: "Maya Chen", note: "full_name from the phone's copy of the profile, read again each time the tab opens" },
        { type: "button", label: "Edit Profile", note: "slides up the edit drawer" },
        { type: "list", label: "🔒 Reset password", note: "opens the shared reset screen, also used by the login page" },
        { type: "list", label: "🗑️ Delete account", note: "asks to confirm, then calls an Edge Function" },
        { type: "list", label: "💬 Feedback · 📢 Report an issue", note: "both open the same Google Form" },
        { type: "button", label: "Sign Out", note: "clears the phone, then signs out" },
      ],
    },
    {
      kind: "screen",
      title: "Account tab (organisation)",
      caption: "An organisation's Account tab: the same rows",
      shot: "/shots/explorify/account-org.png",
      items: [
        { type: "heading", label: "Illini Robotics Club", note: "org_name from the phone's copy; this tab waits for the copy to arrive" },
        { type: "text", label: "Organization Settings", note: "the same two rows, but they behave differently (table below)" },
        { type: "list", label: "Bottom tabs", note: "Other Events · Home · Account" },
      ],
    },
    {
      kind: "table",
      caption: "Where the two tabs differ",
      columns: ["", "Student", "Organisation"],
      state: "derived",
      rows: [
        ["Section heading", "Settings", "Organization Settings"],
        ["Delete account calls", "delete-user, in this repo", "delete-organization, not in this repo"],
        ["Reset password also writes", "nothing more", "the new password, readable, into organizations.password"],
        ["Edit Profile changes", "photo, interests", "photo, bio, contact name, contact email, website, Instagram"],
        ["Waits for the profile copy", "no", "yes, up to 5 retries"],
      ],
    },
    {
      kind: "diagram",
      caption: "Where each action on the tab goes",
      boxes: [
        { id: "tab", label: "Account tab", col: 0, row: 2 },
        { id: "edit", label: "Edit Profile", sub: "drawer", col: 1, row: 0, opens: "ac-profile" },
        { id: "reset", label: "Reset password", sub: "shared screen", col: 1, row: 1, opens: "ac-reset" },
        { id: "del", label: "Delete account", sub: "confirm alert", col: 1, row: 2, opens: "ac-delete" },
        { id: "out", label: "Sign Out", col: 1, row: 4, opens: "ac-signout" },
        { id: "profile", label: "Profile row", sub: "individual / organizations", col: 2, row: 0, opens: "ac-profile" },
        { id: "auth", label: "Supabase Auth", sub: "code, new password", col: 2, row: 1 },
        { id: "fnS", label: "delete-user", sub: "Edge Function", col: 2, row: 2, opens: "ac-delete" },
        { id: "fnO", label: "delete-organization", sub: "not in this repo", col: 2, row: 3, tone: "warn", opens: "ac-delete" },
        { id: "store", label: "Phone storage", sub: "cleared", col: 2, row: 4, opens: "ac-signout" },
      ],
      arrows: [
        { from: "tab", to: "edit" },
        { from: "tab", to: "reset" },
        { from: "tab", to: "del" },
        { from: "tab", to: "out" },
        { from: "edit", to: "profile", label: "saves directly" },
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
      detail: "Edit Profile slides up a drawer filled from the phone's copy: students change their photo and interests, organisations their photo and contact details. Save sends one update and closes, never checking the result or refreshing that copy.",
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
          caption: "A student's drawer with five interests picked",
          shot: "/shots/explorify/ac-profile.png",
          items: [
            { type: "image", label: "Profile photo", note: "tap to replace it (see Profile Photo)" },
            { type: "choice", label: "Interests", note: "the 8 categories, picked ones in blue; tap to add or remove, a sixth is ignored" },
            { type: "text", label: "Maximum of 5 interests can be selected", note: "in red, once 5 are chosen" },
            { type: "button", label: "Save", note: "updates individual.interests and closes; any number from 0 to 5 is accepted" },
          ],
        },
        {
          kind: "screen",
          title: "Edit Profile (organisation)",
          caption: "An organisation's drawer, filled from its profile",
          shot: "/shots/explorify/ac-profile-org.png",
          items: [
            { type: "field", label: "Organization bio", note: "organizations.bio" },
            { type: "field", label: "Contact Name · Contact Email", note: "contact_name, contact_email" },
            { type: "field", label: "Website · Instagram", note: "website, instagram" },
            { type: "button", label: "Save", note: "one update of all five fields, then closes" },
          ],
        },
      ],
      issues: [
        {
          title: "Save never reports a failure",
          detail:
            "Supabase returns a failure as an error value rather than throwing, and both drawers ignore it. So the \"Failed to save profile\" alert can never appear, and a rejected save closes the drawer as if it worked.",
          where: "app/individual/account/components/EditProfileDrawer.tsx:106",
        },
        {
          title: "New interests ignored until reopening",
          detail:
            "The drawer does not update the cached `user`, which every other screen reads. The new interests are in the database, but You Might Like keeps ranking by the old ones until the app is next opened.",
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
          detail: "Tapping the round photo opens the photo library, uploads the pick to the `user_avatar` bucket and points the profile's `avatar_url` at it. Anyone with the file's public address can view it.",
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
                { label: "Name", value: "individual_ or organization_, the time in milliseconds, then the file's extension", state: "derived" },
                { label: "Bucket", value: "user_avatar, in Supabase Storage", state: "derived" },
                { label: "Shown from", value: "the bucket's public URL for that name", state: "derived" },
                { label: "Used by", value: "one shared component, on the Account tab and in the edit drawer, for both kinds of account", state: "derived" },
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
      detail: "Step 1 checks the email is in a profile table, then asks Supabase to email a recovery code. Step 2 takes the code and a new password together and sets it.",
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
          kind: "diagram",
          caption: "Two ways in, one screen, and back to login still signed in",
          boxes: [
            { id: "login", label: "Login screen", sub: "Forgot password", col: 0, row: 0 },
            { id: "acct", label: "Account tab", sub: "Reset password", col: 0, row: 2 },
            { id: "s1", label: "Step 1", sub: "email", col: 1, row: 1 },
            { id: "tables", label: "Profile tables", sub: "individual, then organizations", col: 2, row: 1 },
            { id: "none", label: "No account found", sub: "neither has the email", col: 2, row: 2, tone: "warn" },
            { id: "s2", label: "Step 2", sub: "code + new password", col: 3, row: 1 },
            { id: "end", label: "Login screen", sub: "still signed in", col: 4, row: 1, tone: "warn" },
          ],
          arrows: [
            { from: "login", to: "s1" },
            { from: "acct", to: "s1" },
            { from: "s1", to: "tables", label: "looks up" },
            { from: "tables", to: "none", label: "not found", tone: "warn" },
            { from: "tables", to: "s2", label: "found: code emailed" },
            { from: "s2", to: "end", label: "password set" },
          ],
        },
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
            { from: "Phone", to: "Database", label: "organizations.password = new password", note: "a readable copy beside Supabase Auth's scrambled one", state: "derived" },
            { from: "Phone", to: "Phone", label: "\"Password has been reset successfully\", open login", state: "derived" },
          ],
        },
        {
          kind: "screen",
          title: "Step 1 of 2",
          caption: "Step 1, with an email typed",
          shot: "/shots/explorify/ac-reset.png",
          items: [
            { type: "button", label: "Back arrow", note: "on step 2, back to step 1; on step 1, the previous screen" },
            { type: "heading", label: "What's your email address?" },
            { type: "field", label: "Email", note: "matched exactly as typed — no trimming, no lower-casing" },
            { type: "button", label: "Send OTP", note: "grey until something is typed; \"No account found with this email\" if neither table has it" },
          ],
        },
        {
          kind: "screen",
          title: "Step 2 of 2",
          caption: "Step 2, with a code and a new password typed",
          shot: "/shots/explorify/ac-reset-code.png",
          items: [
            { type: "heading", label: "Enter OTP and New Password" },
            { type: "field", label: "Enter OTP code", note: "number pad, no length limit" },
            { type: "field", label: "New Password", note: "hidden; the sign-up rule is not checked" },
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
      detail: "Sign Out swaps the tab for a spinner and opens the opening screen, wipes all phone storage, and only then calls Supabase's sign-out. The wipe also removes the saved login session.",
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
            { n: 1, title: "Spinner, then the opening screen", detail: "`handleSignOut`, the same in both tabs, sets a \"signing out\" flag, which swaps the tab for a spinner and opens `/`.", state: "derived" },
            { n: 2, title: "Clear phone storage", detail: "`AsyncStorage.clear()`: `user`, `uuid`, `events`, and the Supabase session, which the client keeps in the same storage.", state: "derived" },
            { n: 3, title: "Sign out of Supabase", detail: "With the saved session already gone, there may be nothing left for it to end.", state: "inferred" },
            { n: 4, title: "Back to login", detail: "The opening screen's launch check finds no one signed in.", state: "inferred" },
          ],
        },
        {
          kind: "table",
          caption: "Sign Out and Delete account do the same two things in opposite orders",
          columns: ["", "Sign Out", "Delete account"],
          state: "derived",
          rows: [
            ["First", "clear phone storage", "sign out of Supabase"],
            ["Second", "sign out of Supabase", "clear phone storage"],
            ["Errors", "only logged", "shown in an alert"],
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
      detail: "The app cannot delete a login itself, so after an \"irreversible\" confirmation it asks a server function to. Students call `delete-user`, which is in this repo; organisations call `delete-organization`, which is not.",
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
            { from: "student", to: "delete-user — in supabase/functions/ (see Account Deletion Function under Server Code); deletes the profile row, then the login", state: "derived" },
            { from: "organisation", to: "delete-organization — not in this repo (see Missing Organisation Delete under Server Code)", state: "partial" },
          ],
        },
        {
          kind: "facts",
          rows: [
            { label: "Why a server function", value: "deleting a login needs the project's secret service-role key, which must never ship inside an app; an Edge Function runs on Supabase's servers with it", state: "derived" },
            { label: "The id in the body", value: "sent by the app, ignored by delete-user since commit 304a512 — before that fix it was trusted, so anyone could delete any account", state: "derived" },
            { label: "No session token", value: "delete-user answers \"Unauthorized\" — so a student can only ever delete themselves", state: "derived" },
            { label: "Organisation failure", value: "\"There was an error deleting your organization. Please try again.\"", state: "derived" },
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
            { from: "Phone", to: "Phone", label: "sign out, clear storage, \"Account Deleted\", go to /", state: "derived" },
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
