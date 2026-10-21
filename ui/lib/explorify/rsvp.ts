import type { Node } from "@/lib/data";
/* ═══ 5. JOINING AND SAVING ═══════════════════════════════════
   The root draws every writer and both stored copies; the children are the
   drawer, where a join is stored, cancelling, why the buttons forget, and the
   Saved tab. `rv-column` keeps its id and its "events.rsvp" map row because
   LINKS in index.ts anchor on both. */
export const rsvp: Node = {
  id: "rsvp",
  title: "Joining And Saving",
  sub: "Swipe up to join an event; tap the bookmark to keep it for later",
  footprint: {
    dirs: ["app/individual/index/components/", "app/individual/index/eventdetails.tsx", "app/individual/saved/index.tsx"],
    files: 8,
  },
  group: { ordering: "set", note: "The drawer, where a join is stored, how it is undone, what the buttons believe, and the tab that lists it all." },
  state: "derived",
  col: 0,
  row: 4,
  detail: `Joining happens in a drawer, not on a page. The Join button on any card or event page opens it; one copy of it is drawn for the whole app by \`EventProvider\`, which \`app/_layout.tsx\` wraps around every screen. The student checks their name and contact (filled in from their profile), sets party size and dietary needs, and swipes the blue bar up to confirm.

A join is written in two places. The event's \`rsvp\` column is the guest list: one string of JSON text, keyed by student id, holding each guest's details. The student's own \`individual.rsvp\` is a list of event ids. Every write reads the current value, changes it on the phone, and writes the whole value back — nothing in between stops another phone doing the same.

Saving (the bookmark) only edits \`individual.saved_events\`, another list of event ids. Both lists appear on the Saved tab. Whether a button shows Join or Cancel, filled or empty, comes from a list held in memory that starts empty on every launch — the root of most of the problems listed in the parts below.`,
  code: [
    { file: "app/individual/index/components/eventContext.tsx", start: 17, end: 67, label: "The shared state and the one drawer" },
    { file: "app/_layout.tsx", start: 102, end: 113, label: "Mounted once around the whole app" },
    { file: "app/individual/index/components/rsvpDrawer.tsx", start: 134, end: 190, label: "Confirming a join" },
    { file: "app/individual/index/components/saveButton.tsx", start: 57, end: 101, label: "Saving or unsaving" },
  ],
  anatomy: [
    {
      kind: "diagram",
      caption: "Every place that writes a join or a save, and where it ends up",
      boxes: [
        { id: "join", label: "Join drawer", sub: "adds your entry", col: 0, row: 0 },
        { id: "cancel", label: "Cancel button", sub: "cards, event page", col: 0, row: 1 },
        { id: "scancel", label: "Saved tab Cancel", sub: "expects a list, throws", col: 0, row: 2, tone: "warn" },
        { id: "save", label: "Bookmark", sub: "save or unsave", col: 0, row: 3 },
        { id: "checkin", label: "Organisation check-in", sub: "ticks checkedIn", col: 0, row: 4 },
        { id: "mem", label: "Button memory", sub: "empty on every launch", col: 1, row: 0, tone: "warn" },
        { id: "ersvp", label: "events.rsvp", sub: "guest list, JSON text", col: 1, row: 1 },
        { id: "irsvp", label: "individual.rsvp", sub: "your joined event ids", col: 1, row: 2 },
        { id: "saved", label: "saved_events", sub: "your bookmarked ids", col: 1, row: 3 },
        { id: "phones", label: "Every student's phone", sub: "downloaded with the feed", col: 2, row: 0, tone: "warn" },
        { id: "pages", label: "Guest lists", sub: "event page, check-in", col: 2, row: 1 },
        { id: "tab", label: "Saved tab", sub: "two lists", col: 2, row: 2, tone: "good" },
      ],
      arrows: [
        { from: "join", to: "mem", label: "remembers" },
        { from: "join", to: "ersvp" },
        { from: "join", to: "irsvp" },
        { from: "cancel", to: "ersvp" },
        { from: "cancel", to: "irsvp" },
        { from: "scancel", to: "ersvp", label: "fails", tone: "warn" },
        { from: "save", to: "saved" },
        { from: "checkin", to: "ersvp" },
        { from: "ersvp", to: "phones", tone: "warn" },
        { from: "ersvp", to: "pages" },
        { from: "irsvp", to: "tab" },
        { from: "saved", to: "tab" },
      ],
    },
    {
      kind: "sequence",
      caption: "Joining, message by message",
      actors: ["Student", "Phone", "Supabase"],
      rows: [
        { from: "Student", to: "Phone", label: "taps Join", state: "derived" },
        { from: "Phone", to: "Phone", label: "drawer opens, name and contact pre-filled", state: "derived" },
        { from: "Student", to: "Phone", label: "party size, diet, swipes up", state: "derived" },
        { from: "Phone", to: "Supabase", label: "read this event's rsvp", state: "derived" },
        { from: "Supabase", to: "Phone", label: "the guest list text", state: "derived" },
        { from: "Phone", to: "Phone", label: "add or replace my entry", state: "derived" },
        { from: "Phone", to: "Supabase", label: "write the whole guest list back", note: "a join saved in between is lost", state: "derived" },
        { from: "Phone", to: "Supabase", label: "read, then write my rsvp list", note: "a failure here is only logged", state: "derived" },
        { from: "Phone", to: "Phone", label: "remember \"joined\"; Done or Add to Calendar", state: "derived" },
      ],
    },
  ],
  children: [
    {
      id: "rv-swipe",
      title: "The RSVP Drawer",
      sub: "A form sliding up from the bottom; dragging its blue bar up confirms",
      footprint: { dirs: ["app/individual/index/components/rsvpDrawer.tsx"], files: 1 },
      state: "derived",
      col: 0,
      row: 0,
      detail: `The drawer shows the event's name, address, date and time, then a short form. Name and contact are text boxes pre-filled from the \`user\` copy on the phone and can be edited; party size is a − / + counter starting at 1; dietary needs are seven buttons, and choosing "Other" opens a box for your own, comma-separated.

The blue bar at the bottom follows your finger. Let go after dragging it more than 50 points up and the bar grows to fill the screen, "RSVP Confirmed!" appears, and when that animation ends the join is written. Anything less springs back. Dragging the whole drawer down more than 100 points, or tapping outside it, closes it without joining.

Two seconds after a successful write, Done (close and go back) and Add to Calendar (opens Google Calendar with the event filled in) appear. If the write fails, the confirmation simply disappears; the error only goes to the log.`,
      code: [
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 82, end: 90, label: "The dietary choices" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 388, end: 414, label: "Pre-filling name and contact" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 287, end: 300, label: "\"Other\": your own, comma-separated" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 302, end: 343, label: "The swipe: more than 50 points up confirms" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 134, end: 190, label: "What confirming writes" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 263, end: 285, label: "Add to Calendar" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 479, end: 710, label: "What the drawer draws" },
      ],
      anatomy: [
        {
          kind: "screen",
          title: "RSVP drawer",
          items: [
            { type: "heading", label: "RSVP" },
            { type: "text", label: "Robotics Night · 📍 address · 📅 date · ⏰ time" },
            { type: "field", label: "Name *", note: "pre-filled from your profile" },
            { type: "field", label: "Contact *", note: "pre-filled with your email; \"email or phone number\"" },
            { type: "choice", label: "Party Size *  −  1  +", note: "never below 1" },
            { type: "choice", label: "Dietary restrictions *", note: "the seven buttons below; any number" },
            { type: "field", label: "Enter any dietary restrictions (comma-separated)", note: "only when Other is on" },
            { type: "button", label: "^ Swipe Up to Confirm!", note: "drag more than 50 points up" },
            { type: "text", label: "RSVP Confirmed!", note: "replaces the bar while saving" },
            { type: "button", label: "Done", note: "closes and goes back a screen" },
            { type: "button", label: "Add to Calendar", note: "Google Calendar link" },
          ],
        },
        {
          kind: "table",
          caption: "The dietary buttons — the label is stored exactly as shown, emoji included",
          columns: ["Button", "Stored as"],
          state: "derived",
          rows: [
            ["🥗 Vegetarian", "\"🥗 Vegetarian\""],
            ["🕌 Halal", "\"🕌 Halal\""],
            ["🌾 Gluten-free", "\"🌾 Gluten-free\""],
            ["🥛 Dairy-free", "\"🥛 Dairy-free\""],
            ["🥕 Vegan", "\"🥕 Vegan\""],
            ["🥜 Peanut", "\"🥜 Peanut\""],
            ["Other", "not stored; each comma-separated word you type is stored instead"],
          ],
        },
        {
          kind: "diagram",
          caption: "What a swipe does",
          boxes: [
            { id: "drag", label: "Drag the blue bar", col: 0, row: 1 },
            { id: "back", label: "Springs back", sub: "50 points or less", col: 1, row: 0 },
            { id: "conf", label: "RSVP Confirmed!", sub: "shown before saving", col: 1, row: 1 },
            { id: "write", label: "Write the join", sub: "two places", col: 2, row: 1 },
            { id: "done", label: "Done / Calendar", sub: "after 2 seconds", col: 3, row: 0, tone: "good" },
            { id: "fail", label: "Overlay vanishes", sub: "error only logged", col: 3, row: 2, tone: "warn" },
          ],
          arrows: [
            { from: "drag", to: "back", label: "short" },
            { from: "drag", to: "conf", label: "over 50" },
            { from: "conf", to: "write", label: "animation ends" },
            { from: "write", to: "done", label: "ok", tone: "good" },
            { from: "write", to: "fail", label: "error", tone: "warn" },
          ],
        },
      ],
      issues: [
        {
          title: "Starred fields are never checked",
          detail:
            "Name, Contact, Party Size and Dietary restrictions are all marked required, but confirming checks none of them. A student who clears Contact joins with an empty contact the organisation cannot reach.",
          where: "app/individual/index/components/rsvpDrawer.tsx:157",
        },
        {
          title: "A failed join looks like nothing happened",
          detail:
            "\"RSVP Confirmed!\" shows before the write. If the write fails, the overlay disappears and the swipe bar returns with no message — the student cannot tell whether they joined.",
          where: "app/individual/index/components/rsvpDrawer.tsx:184",
        },
      ],
    },
    {
      id: "rv-column",
      title: "Where Joins Are Stored",
      sub: "The event's guest list, one JSON string — and a second copy on the student",
      footprint: { dirs: ["app/individual/index/components/rsvpDrawer.tsx", "app/org/index/attendees.tsx"], files: 4 },
      shape: { kind: "figure", id: "rsvp-writers", note: "Each writer reads, edits and saves the whole string; nothing locks it" },
      state: "derived",
      col: 0,
      row: 1,
      detail: `\`events.rsvp\` is a text column holding JSON: an object keyed by student id, each value that student's name, contact, party size and dietary needs. The organisation's check-in adds \`checkedIn\` to an entry. Because it is text, the database cannot look inside it — every reader downloads the whole string and parses it on the phone.

Every writer does the same three steps: read the string, change one entry on the phone, write the whole string back. Two phones doing this at once both start from the same old string, and whichever writes second erases the other's change. Joining also writes a second copy — the event's id added to the student's \`individual.rsvp\` list — only after the first write succeeds, with no transaction around the two.

For a student's join to succeed, Supabase must let a student update a row of \`events\` they do not own. Whether the access rules limit that to this column is not in the repo (see Supabase Backend → Access Rules Needed).`,
      code: [
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 145, end: 149, label: "1. Read the guest list" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 155, end: 164, label: "2. Add or replace your entry" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 166, end: 170, label: "3. Write the whole string back" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 192, end: 223, label: "The second copy, on the student" },
        { file: "app/org/index/attendees.tsx", start: 97, end: 106, label: "Check-in rewrites the same string" },
      ],
      anatomy: [
        {
          kind: "map",
          caption: "Where a join is recorded",
          rows: [
            { from: "events.rsvp", to: "the guest list: { studentId: { fullName, email, partySize, dietaryRestrictions } }, stored as text", state: "derived" },
            { from: "individual.rsvp", to: "the same fact from the student's side: a list of event ids", state: "derived" },
          ],
        },
        {
          kind: "example",
          caption: "One event's rsvp, laid out for reading (values invented; stored as a single line of text)",
          value: `{
  "3b7e…": {
    "fullName": "Ana Ruiz",
    "email": "ana@illinois.edu",
    "partySize": 2,
    "dietaryRestrictions": ["🥗 Vegetarian", "shellfish"]
  },
  "a91c…": {
    "fullName": "Ben Okafor",
    "email": "217-555-0143",
    "partySize": 1,
    "dietaryRestrictions": [],
    "checkedIn": true
  }
}`,
          notes: [
            { label: "keys", value: "student user ids — the same ids as individual.id", state: "derived" },
            { label: "email", value: "whatever was in Contact: an email or a phone number", state: "derived" },
            { label: "checkedIn", value: "added only by the organisation's check-in", state: "derived" },
          ],
        },
        {
          kind: "table",
          caption: "Everything that writes the guest list",
          columns: ["Writer", "What it does", "Works?"],
          state: "derived",
          rows: [
            ["Join drawer", "adds your entry, or replaces it — dropping any checkedIn", "yes"],
            ["Cancel on cards and the event page", "deletes your entry", "yes"],
            ["Cancel on the Saved tab", "treats the guest list as a list of ids", "no — throws, changes nothing"],
            ["Organisation check-in", "flips checkedIn on one entry, from the copy loaded when the screen opened", "yes, but can undo other writes"],
            ["Event page's own cancel", "deletes your entry", "never called"],
            ["rsvpEvents.tsx", "same as the Saved tab", "never imported"],
          ],
        },
        {
          kind: "table",
          caption: "Everything that reads it",
          columns: ["Reader", "Uses"],
          state: "derived",
          rows: [
            ["Home's download", "the whole string, saved on every student's phone"],
            ["You Might Like", "number of entries (popularity); faces and party sizes per card"],
            ["Event page and its View all", "names, faces, party sizes"],
            ["Organisation's attendee list", "everything: names, contacts, diets, check-in"],
          ],
        },
      ],
      issues: [
        {
          title: "Two joins at once lose one",
          detail:
            "Both phones read the same string, each adds itself, and the second write erases the first. The lost student believes they joined; the organisation never sees them. Check-in races the same way.",
          where: "app/individual/index/components/rsvpDrawer.tsx:145",
        },
        {
          title: "The two copies can disagree",
          detail:
            "The student's own list is updated after the guest list, with no transaction. If that second write fails it is only logged: the event lists the student but their Saved tab does not.",
          where: "app/individual/index/components/rsvpDrawer.tsx:217",
        },
        {
          title: "Joining again erases a check-in",
          detail:
            "A join writes a fresh entry with no `checkedIn`. After a restart the button shows Join again, so a checked-in student who taps it is silently un-checked.",
          where: "app/individual/index/components/rsvpDrawer.tsx:157",
        },
      ],
    },
    {
      id: "rv-cancel",
      title: "Cancelling A Join",
      sub: "Four copies of the same undo: one wired up and working, one broken, two unused",
      footprint: {
        dirs: [
          "app/individual/index/components/joinButton.tsx",
          "app/individual/index/eventdetails.tsx",
          "app/individual/saved/index.tsx",
          "app/individual/index/components/rsvpEvents.tsx",
        ],
        files: 4,
      },
      state: "derived",
      col: 0,
      row: 2,
      detail: `Undoing a join is written four times. The one that works is in \`joinButton.tsx\`: when the button believes you have joined it shows a red Cancel, which deletes your key from the guest list, then removes the event id from your own list, then flips the in-memory "joined" flag.

The Saved tab's Cancel was written for an older format, when the guest list was a list of ids. It parses the string, gets an object, and calls \`.includes\` on it — which objects do not have. The resulting error is caught and logged, so the button looks dead: the student stays on the guest list and on their own list.

The event page defines its own cancel, which runs both writes together, but nothing calls it — its Join button is the shared \`JoinButton\`. \`rsvpEvents.tsx\` holds a fourth copy with the Saved tab's bug, in a component nothing imports.`,
      code: [
        { file: "app/individual/index/components/joinButton.tsx", start: 28, end: 79, label: "The cancel that works" },
        { file: "app/individual/saved/index.tsx", start: 114, end: 153, label: "The Saved tab's cancel, which throws" },
        { file: "app/individual/index/eventdetails.tsx", start: 224, end: 261, label: "The event page's cancel, never called" },
        { file: "app/individual/index/components/rsvpEvents.tsx", start: 85, end: 128, label: "A fourth copy, never imported" },
      ],
      anatomy: [
        {
          kind: "table",
          caption: "The four copies",
          columns: ["Where", "Treats the guest list as", "Reached from", "Result"],
          state: "derived",
          rows: [
            ["joinButton.tsx", "an object — correct", "red Cancel on cards and the event page", "works"],
            ["saved/index.tsx", "a list of ids", "Cancel on the Saved tab's RSVP list", "throws; nothing changes"],
            ["eventdetails.tsx", "an object — correct", "nothing", "unused"],
            ["rsvpEvents.tsx", "a list of ids", "nothing — never imported", "unused"],
          ],
        },
        {
          kind: "example",
          caption: "Why the Saved tab's Cancel throws",
          value: `expects:   ["3b7e…", "a91c…"]                    a list of student ids
gets:      { "3b7e…": { … }, "a91c…": { … } }      an object keyed by student id

rsvpArray.includes(userId)
→ TypeError: rsvpArray.includes is not a function
→ caught, logged; neither list changes`,
        },
        {
          kind: "diagram",
          caption: "Which Cancel the student can actually reach",
          boxes: [
            { id: "card", label: "Card or event page", col: 0, row: 0 },
            { id: "savedtab", label: "Saved tab", sub: "RSVP list", col: 0, row: 2 },
            { id: "mem", label: "Joined this launch?", col: 1, row: 0 },
            { id: "join", label: "Shows Join", sub: "opens the drawer", col: 2, row: 1, tone: "warn" },
            { id: "works", label: "Cancel works", sub: "both lists updated", col: 2, row: 0, tone: "good" },
            { id: "throws", label: "Cancel throws", sub: "nothing changes", col: 2, row: 2, tone: "warn" },
          ],
          arrows: [
            { from: "card", to: "mem" },
            { from: "mem", to: "works", label: "yes", tone: "good" },
            { from: "mem", to: "join", label: "no", tone: "warn" },
            { from: "savedtab", to: "throws", tone: "warn" },
          ],
        },
      ],
      issues: [
        {
          title: "Cancel on the Saved tab does nothing",
          detail:
            "It treats the guest list as an array and throws before writing. Combined with the buttons forgetting on restart, a student who joined in an earlier session has no working way to cancel.",
          where: "app/individual/saved/index.tsx:127",
        },
      ],
    },
    {
      id: "rv-state",
      title: "Join And Save Buttons",
      sub: "How a button decides what to show — and why it forgets after a restart",
      footprint: {
        dirs: [
          "app/individual/index/components/eventContext.tsx",
          "app/individual/index/components/joinButton.tsx",
          "app/individual/index/components/saveButton.tsx",
        ],
        files: 3,
      },
      state: "derived",
      col: 0,
      row: 3,
      detail: `Both buttons ask \`EventProvider\` — shared state at the app root — whether this event is in \`joinedEvents\` or \`savedEvents\`. Those lists start empty on every launch and only change when the student joins, cancels, saves or unsaves in this session. Nothing ever loads them from the database.

The real lists are fetched: Home downloads \`individual.rsvp\` and \`saved_events\` and passes \`isRSVPd\` to every Join button. But \`JoinButton\` declares no such prop and ignores it; Home's saved list is never used at all. The Save button also queries the saved list when it appears, but only hands the answer to an \`onSaveStateChange\` callback nobody passes.

So after a restart, every event shows Join and an empty bookmark, whatever is true. Joining again mostly just replaces your own entry, but Cancel is unreachable from these buttons, and Save, believing nothing is saved, appends the id a second time.`,
      code: [
        { file: "app/individual/index/components/eventContext.tsx", start: 17, end: 37, label: "Two lists that start empty" },
        { file: "app/individual/index/components/joinButton.tsx", start: 9, end: 26, label: "Join decides from memory; isRSVPd is not a prop" },
        { file: "app/individual/index/components/saveButton.tsx", start: 26, end: 55, label: "Save decides from memory; its own query goes nowhere" },
        { file: "app/individual/index/components/saveButton.tsx", start: 74, end: 83, label: "Saving appends without checking" },
        { file: "app/individual/index/index.tsx", start: 223, end: 261, label: "Home fetches the real lists" },
      ],
      anatomy: [
        {
          kind: "diagram",
          caption: "The real lists are fetched but never reach the buttons",
          boxes: [
            { id: "db", label: "Your profile row", sub: "rsvp, saved_events", col: 0, row: 0 },
            { id: "home", label: "Home's own state", sub: "fetched on first visit", col: 1, row: 0 },
            { id: "prop", label: "isRSVPd prop", sub: "not declared, ignored", col: 2, row: 0, tone: "warn" },
            { id: "ctx", label: "Shared button memory", sub: "empty at launch", col: 1, row: 2, tone: "warn" },
            { id: "jb", label: "Join button", col: 3, row: 1 },
            { id: "sb", label: "Save button", col: 3, row: 2 },
            { id: "acts", label: "Join, cancel, save", sub: "in this session", col: 0, row: 2 },
          ],
          arrows: [
            { from: "db", to: "home" },
            { from: "home", to: "prop" },
            { from: "prop", to: "jb", label: "dropped", tone: "warn" },
            { from: "acts", to: "ctx", label: "toggles" },
            { from: "ctx", to: "jb", label: "decides" },
            { from: "ctx", to: "sb", label: "decides" },
          ],
        },
        {
          kind: "table",
          caption: "What the buttons show, against the truth",
          columns: ["Situation", "Button shows", "Tapping it"],
          state: "derived",
          rows: [
            ["Joined in this session", "red Cancel", "cancels — works"],
            ["Joined before this launch", "Join", "opens the drawer; joining again replaces your entry"],
            ["Saved in this session", "filled bookmark", "unsaves"],
            ["Saved before this launch", "empty bookmark", "adds the id again — a duplicate"],
            ["On the Saved tab's Saved list", "empty bookmark", "adds a duplicate instead of removing"],
          ],
        },
      ],
      issues: [
        {
          title: "Buttons forget everything after a restart",
          detail:
            "The shared lists start empty and are never loaded, so every joined event shows Join and every saved event an empty bookmark. The correct lists Home fetches are passed as a prop the button does not read.",
          where: "app/individual/index/components/joinButton.tsx:22",
        },
        {
          title: "Saving can store the same event twice",
          detail:
            "Believing nothing is saved, the bookmark appends the id to `saved_events` without checking — on the Saved list itself, tapping to remove adds a second copy instead.",
          where: "app/individual/index/components/saveButton.tsx:82",
        },
      ],
    },
    {
      id: "rv-saved",
      title: "The Saved Tab",
      sub: "Two swipeable lists: events you joined and events you bookmarked",
      footprint: { dirs: ["app/individual/saved/index.tsx"], files: 1 },
      state: "derived",
      col: 0,
      row: 4,
      detail: `The heart tab. Each time it comes into view it asks Supabase who is signed in, reads that student's \`rsvp\` and \`saved_events\` lists, and downloads every column of the events with those ids — one query per list. Unlike Home, it does not filter by university, by date or by \`published\`, so past events stay on these lists for good.

Two tabs, "RSVPd Events" and "Saved Events", sit side by side; tap a title or swipe across. Each card shows the date, name, place and time. On the RSVP list the button is a red Cancel (the broken copy — see Cancelling A Join); on the Saved list it is the bookmark (see Join And Save Buttons).

Tapping a card asks to open \`eventdetails\`, but the Saved tab's own stack has only this one screen, and that name belongs to the Home tab's stack.`,
      code: [
        { file: "app/individual/saved/index.tsx", start: 46, end: 102, label: "Loading both lists" },
        { file: "app/individual/saved/index.tsx", start: 104, end: 112, label: "Reloading on focus; tapping a card" },
        { file: "app/individual/saved/index.tsx", start: 238, end: 255, label: "Cancel on one list, bookmark on the other" },
        { file: "app/individual/saved/index.tsx", start: 296, end: 330, label: "The two tab titles" },
        { file: "app/individual/saved/_layout.tsx", start: 1, end: 11, label: "The tab's stack: one screen" },
      ],
      anatomy: [
        {
          kind: "screen",
          title: "Saved tab",
          items: [
            { type: "choice", label: "RSVPd Events  |  Saved Events", note: "tap or swipe between them" },
            { type: "list", label: "Event cards", note: "date, name, place, time — past events included" },
            { type: "button", label: "Cancel", note: "RSVP list; throws, does nothing" },
            { type: "button", label: "Bookmark", note: "Saved list; starts empty-looking" },
          ],
        },
        {
          kind: "sequence",
          caption: "Each time the tab comes into view",
          actors: ["Phone", "Supabase"],
          rows: [
            { from: "Phone", to: "Supabase", label: "who is signed in?", state: "derived" },
            { from: "Phone", to: "Supabase", label: "my rsvp and saved_events lists", state: "derived" },
            { from: "Phone", to: "Supabase", label: "every column of my joined events", state: "derived" },
            { from: "Phone", to: "Supabase", label: "every column of my saved events", state: "derived" },
          ],
        },
      ],
      issues: [
        {
          title: "Tapping a saved event may go nowhere",
          detail:
            "The card navigates to `eventdetails`, a screen only the Home tab's stack has; the Saved tab's stack holds just this screen. React Navigation looks for a name upward, not in sibling tabs, so the tap is not expected to be handled.",
          where: "app/individual/saved/index.tsx:111",
        },
      ],
    },
  ],
};
