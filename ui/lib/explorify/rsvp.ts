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
  detail: "Join opens a drawer; swiping it up writes you into the event's guest list and your own list of joined events. The bookmark only adds the event to your saved list; the Saved tab shows both.",
  code: [
    { file: "app/individual/index/components/eventContext.tsx", start: 17, end: 67, label: "The shared state and the one drawer" },
    { file: "app/_layout.tsx", start: 102, end: 113, label: "Mounted once around the whole app" },
    { file: "app/individual/index/components/rsvpDrawer.tsx", start: 134, end: 190, label: "Confirming a join" },
    { file: "app/individual/index/components/saveButton.tsx", start: 57, end: 101, label: "Saving or unsaving" },
  ],
  anatomy: [
    {
      kind: "diagram",
      caption: "Every place that writes a join or a save, and where it ends up — the button memory, empty on every launch, is behind most of the problems below",
      boxes: [
        { id: "join", label: "Join drawer", sub: "adds your entry", col: 0, row: 0, opens: "rv-swipe" },
        { id: "cancel", label: "Cancel button", sub: "cards, event page", col: 0, row: 1, opens: "rv-cancel" },
        { id: "scancel", label: "Saved tab Cancel", sub: "expects a list, throws", col: 0, row: 2, tone: "warn", opens: "rv-cancel" },
        { id: "save", label: "Bookmark", sub: "save or unsave", col: 0, row: 3 },
        { id: "checkin", label: "Organisation check-in", sub: "ticks checkedIn", col: 0, row: 4 },
        { id: "mem", label: "Button memory", sub: "empty on every launch", col: 1, row: 0, tone: "warn", opens: "rv-state" },
        { id: "ersvp", label: "events.rsvp", sub: "guest list, JSON text", col: 1, row: 1, opens: "rv-column" },
        { id: "irsvp", label: "individual.rsvp", sub: "your joined event ids", col: 1, row: 2, opens: "rv-column" },
        { id: "saved", label: "saved_events", sub: "your bookmarked ids", col: 1, row: 3, opens: "rv-saved" },
        { id: "phones", label: "Every student's phone", sub: "downloaded with the feed", col: 2, row: 0, tone: "warn" },
        { id: "pages", label: "Guest lists", sub: "event page, check-in", col: 2, row: 1 },
        { id: "tab", label: "Saved tab", sub: "two lists", col: 2, row: 2, tone: "good", opens: "rv-saved" },
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
        { from: "Student", to: "Phone", label: "taps Join", note: "on any card or the event page", state: "derived" },
        { from: "Phone", to: "Phone", label: "drawer opens, name and contact pre-filled", note: "one drawer for the whole app, drawn by EventProvider around every screen", state: "derived" },
        { from: "Student", to: "Phone", label: "party size, diet, swipes up", state: "derived" },
        { from: "Phone", to: "Supabase", label: "read this event's rsvp", state: "derived" },
        { from: "Supabase", to: "Phone", label: "the guest list text", note: "JSON keyed by student id", state: "derived" },
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
      detail: "A form slides up with your name and contact already filled in. Dragging the blue bar more than 50 points up confirms, and the join is written once the confirmation animation ends.",
      code: [
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 82, end: 90, label: "The dietary choices" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 388, end: 414, label: "Pre-filling name and contact" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 287, end: 300, label: "\"Other\": your own, comma-separated" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 302, end: 343, label: "The swipe: more than 50 points up confirms" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 345, end: 364, label: "Dragging the drawer down 100 points closes it" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 442, end: 458, label: "Tapping outside closes it" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 134, end: 190, label: "What confirming writes" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 263, end: 285, label: "Add to Calendar" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 479, end: 710, label: "What the drawer draws" },
      ],
      anatomy: [
        {
          kind: "screen",
          title: "RSVP drawer",
          caption: "Join on the event page, for Maya — who already joined this event with a party of 2",
          shot: "/shots/explorify/rv-swipe.png",
          items: [
            { type: "text", label: "📍 Siebel Center · 📅 Friday, October 23", note: "place name only; the date is a day early, as on the event page" },
            { type: "field", label: "Name *", note: "pre-filled from the \"user\" copy; editable" },
            { type: "field", label: "Contact *", note: "pre-filled with your email; an email or a phone number" },
            { type: "choice", label: "Party Size *  −  1  +", note: "starts at 1, never below — Maya's earlier answers are not loaded" },
            { type: "choice", label: "Dietary restrictions *", note: "seven buttons, any number; Other opens a box for your own, comma-separated" },
            { type: "button", label: "^ Swipe Up to Confirm!", note: "follows your finger; more than 50 points up confirms" },
          ],
        },
        {
          kind: "screen",
          title: "Confirming",
          caption: "Just after the swipe",
          shot: "/shots/explorify/rv-swipe-confirmed.png",
          items: [
            { type: "text", label: "RSVP Confirmed!", note: "the bar grows to fill the screen; shown before anything is saved" },
            { type: "image", label: "Spinner", note: "the join is being written" },
          ],
        },
        {
          kind: "screen",
          title: "Done",
          caption: "Two seconds after a successful write",
          shot: "/shots/explorify/rv-swipe-done.png",
          items: [
            { type: "button", label: "Done", note: "closes the drawer and goes back a screen" },
            { type: "button", label: "Add to Calendar", note: "opens Google Calendar with the event filled in" },
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
            { id: "down", label: "Drawer dragged down", sub: "over 100 points, or tap outside", col: 0, row: 3 },
            { id: "closed", label: "Closed", sub: "nothing written", col: 1, row: 3 },
          ],
          arrows: [
            { from: "down", to: "closed" },
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
      detail: "Each event's guest list is one JSON string in `events.rsvp`, keyed by student id. Every writer reads the whole string, changes one entry and writes it all back, so simultaneous writes erase each other.",
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
            { from: "individual.rsvp", to: "the same fact from the student's side: a list of event ids, written only after the guest list succeeds, with no transaction around the two", state: "derived" },
          ],
        },
        {
          kind: "sequence",
          caption: "Two students join at once — the same three steps every writer takes",
          actors: ["Phone A", "Supabase", "Phone B"],
          rows: [
            { from: "Phone A", to: "Supabase", label: "1. read the guest list", state: "derived" },
            { from: "Phone B", to: "Supabase", label: "1. read the same guest list", state: "derived" },
            { from: "Phone A", to: "Phone A", label: "2. add A's entry", state: "derived" },
            { from: "Phone B", to: "Phone B", label: "2. add B's entry", state: "derived" },
            { from: "Phone A", to: "Supabase", label: "3. write the whole string: A added", state: "derived" },
            { from: "Phone B", to: "Supabase", label: "3. write the whole string: B added, A gone", note: "A believes they joined", state: "derived" },
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
          caption: "Everything that writes the guest list — a student's join works only if Supabase lets students update an event row they don't own (see Access Rules Needed)",
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
          caption: "Everything that reads it — the database cannot look inside text, so each downloads the whole string and parses it on the phone",
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
      detail: "Undoing a join is written four times, and only one works: the red Cancel on cards and the event page. The Saved tab's Cancel throws, and the other two are never called.",
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
            ["saved/index.tsx", "a list of ids — an older format", "Cancel on the Saved tab's RSVP list", "throws; nothing changes"],
            ["eventdetails.tsx", "an object — correct; runs both writes together", "nothing — the page uses the shared Join button", "unused"],
            ["rsvpEvents.tsx", "a list of ids — the Saved tab's bug", "nothing — never imported", "unused"],
          ],
        },
        {
          kind: "sequence",
          caption: "The Cancel that works (joinButton.tsx)",
          actors: ["Phone", "Supabase"],
          rows: [
            { from: "Phone", to: "Supabase", label: "read the event's guest list", state: "derived" },
            { from: "Phone", to: "Supabase", label: "write it back without my key", state: "derived" },
            { from: "Phone", to: "Supabase", label: "read my rsvp list", state: "derived" },
            { from: "Phone", to: "Supabase", label: "write it back without this event", state: "derived" },
            { from: "Phone", to: "Phone", label: "flip the in-memory \"joined\" flag", note: "the button turns back to Join", state: "derived" },
          ],
        },
        {
          kind: "screen",
          title: "Where the working Cancel shows",
          caption: "Home, right after Maya joins in this session",
          shot: "/shots/explorify/rv-state-joined.png",
          items: [
            { type: "button", label: "Cancel", note: "red only while the button believes you joined — after a restart it says Join" },
          ],
        },
        {
          kind: "example",
          caption: "Why the Saved tab's Cancel throws",
          value: `expects:   ["3b7e…", "a91c…"]                    a list of student ids
gets:      { "3b7e…": { … }, "a91c…": { … } }      an object keyed by student id

rsvpArray.includes(userId)
→ TypeError: rsvpArray.includes is not a function
→ caught, logged; neither list changes — the button looks dead`,
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
      detail: "Join and the bookmark decide what to show from shared lists in memory that start empty on every launch. The real lists are downloaded but never reach the buttons.",
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
            { id: "prop", label: "isRSVPd / isRSVP", sub: "props not declared, ignored", col: 2, row: 0, tone: "warn" },
            { id: "hsaved", label: "Home's saved list", sub: "never used", col: 2, row: 1, tone: "warn" },
            { id: "ctx", label: "Shared button memory", sub: "EventProvider, empty at launch", col: 1, row: 2, tone: "warn" },
            { id: "jb", label: "Join button", col: 3, row: 1 },
            { id: "sb", label: "Save button", col: 3, row: 2 },
            { id: "sq", label: "Save's own query", sub: "to onSaveStateChange, never passed", col: 3, row: 3, tone: "warn" },
            { id: "acts", label: "Join, cancel, save", sub: "in this session", col: 0, row: 2 },
          ],
          arrows: [
            { from: "db", to: "home" },
            { from: "home", to: "prop" },
            { from: "home", to: "hsaved" },
            { from: "prop", to: "jb", label: "dropped", tone: "warn" },
            { from: "acts", to: "ctx", label: "toggles" },
            { from: "ctx", to: "jb", label: "decides" },
            { from: "ctx", to: "sb", label: "decides" },
            { from: "sb", to: "sq", label: "on appear", tone: "warn" },
          ],
        },
        {
          kind: "table",
          caption: "What the buttons show, against the truth",
          columns: ["Situation", "Button shows", "Tapping it"],
          state: "derived",
          rows: [
            ["Joined in this session", "red Cancel", "cancels — works"],
            ["Joined before this launch", "Join", "opens the drawer; joining again replaces your entry — Cancel is unreachable"],
            ["Saved in this session", "filled bookmark", "unsaves"],
            ["Saved before this launch", "empty bookmark", "adds the id again — a duplicate"],
            ["On the Saved tab's Saved list", "empty bookmark", "adds a duplicate instead of removing"],
          ],
        },
        {
          kind: "screen",
          title: "After a fresh launch",
          caption: "Maya joined Robotics Demo Night in an earlier session",
          shot: "/shots/explorify/rv-state.png",
          items: [
            { type: "button", label: "Join", note: "both rows say Join although she is on the guest list" },
          ],
        },
        {
          kind: "screen",
          title: "After joining again",
          caption: "Same screen, once the drawer's Done is tapped",
          shot: "/shots/explorify/rv-state-joined.png",
          items: [
            { type: "button", label: "Cancel", note: "the shared memory now holds this event, so every Join for it turns red" },
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
      detail: "The heart tab lists the events you joined and the events you bookmarked, side by side. Each visit downloads both lists fresh, with no university, date or draft filter.",
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
          title: "RSVPd Events",
          caption: "Maya's Saved tab: she joined Robotics Demo Night",
          shot: "/shots/explorify/rv-saved.png",
          items: [
            { type: "choice", label: "RSVPd Events  |  Saved Events", note: "tap a title or swipe across" },
            { type: "list", label: "Event card", note: "date, name, place, time — past events stay for good" },
            { type: "button", label: "Cancel", note: "the broken copy: throws, changes nothing — see Cancelling A Join" },
            { type: "button", label: "Tapping the card", note: "asks for eventdetails, a screen only the Home tab has" },
          ],
        },
        {
          kind: "screen",
          title: "Saved Events",
          caption: "She bookmarked Lantern Festival",
          shot: "/shots/explorify/rv-saved-bookmarks.png",
          items: [
            { type: "button", label: "Bookmark", note: "empty although the event is saved — tapping it adds the id again (see Join And Save Buttons)" },
          ],
        },
        {
          kind: "sequence",
          caption: "Each time the tab comes into view",
          actors: ["Phone", "Supabase"],
          rows: [
            { from: "Phone", to: "Supabase", label: "who is signed in?", state: "derived" },
            { from: "Phone", to: "Supabase", label: "my rsvp and saved_events lists", state: "derived" },
            { from: "Phone", to: "Supabase", label: "every column of my joined events", note: "one query per list; no university, date or published filter", state: "derived" },
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
