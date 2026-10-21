import type { Node } from "@/lib/data";
/* ═══ 6. CHECKING PEOPLE IN ══════════════════════════════════
   The organisation's side of a guest list: what one RSVP holds, the two
   screens that read it, and the tap that writes it back. */
export const checkIn: Node = {
  id: "check-in",
  title: "Checking People In",
  sub: "How an organisation sees who is coming and marks each person as arrived",
  footprint: {
    dirs: ["app/org/index/eventdetails.tsx", "app/org/index/attendees.tsx"],
    files: 3,
  },
  group: { ordering: "sequence" },
  shape: { kind: "figure", id: "rsvp-writers", note: "Check-in is one of four writers of the same guest-list text" },
  state: "derived",
  col: 0,
  row: 5,
  detail: `There is no guest-list table. Each event row has one text column, \`rsvp\`, holding a JSON object with one entry per student who joined, keyed by their user id. Students add and remove their own entry; the organisation only reads it — except for one flag, \`checkedIn\`.

The path is three screens. From the Ongoing (or Archive) list, tapping an event opens its details page, which fetches \`rsvp\` fresh to show a headcount and faces. "View all" opens the Attendees screen: a tally of dietary needs and a list of everyone who joined. Tapping a person there toggles their \`checkedIn\` flag and writes the whole \`rsvp\` text back.

The catch is which copy gets written back. The Attendees screen does not use the fresh copy the details page just fetched; it starts from the event row loaded when the list was opened, so the first tap can overwrite anyone who joined since.`,
  code: [
    { file: "app/org/index/eventdetails.tsx", start: 145, end: 187, label: "Event details re-reads the guest list" },
    { file: "app/org/index/eventdetails.tsx", start: 199, end: 201, label: "View all passes on the list's older copy" },
    { file: "app/org/index/attendees.tsx", start: 97, end: 123, label: "A tap rewrites the whole guest list" },
  ],
  anatomy: [
    {
      kind: "diagram",
      caption: "How the organiser reaches the guest list, and which copy each screen uses",
      boxes: [
        { id: "ongoing", label: "Ongoing list", sub: "loads events with rsvp", col: 0, row: 0 },
        { id: "archive", label: "Archive list", sub: "past events", col: 0, row: 1 },
        { id: "search", label: "Search", sub: "any event on the campus", col: 0, row: 2, tone: "warn" },
        { id: "details", label: "Event details", sub: "re-reads rsvp", col: 1, row: 1 },
        { id: "attendees", label: "Attendees screen", sub: "starts from the old copy", col: 2, row: 1, tone: "warn" },
        { id: "profiles", label: "Student profiles", sub: "pictures only", col: 2, row: 2 },
        { id: "rsvp", label: "events.rsvp", sub: "one JSON text", col: 3, row: 0 },
      ],
      arrows: [
        { from: "ongoing", to: "details", label: "tap" },
        { from: "archive", to: "details", label: "tap" },
        { from: "search", to: "details", label: "other organisations' too", tone: "warn" },
        { from: "details", to: "rsvp", label: "fresh read" },
        { from: "details", to: "profiles", label: "pictures" },
        { from: "details", to: "attendees", label: "View all" },
        { from: "attendees", to: "rsvp", label: "tap rewrites it all", tone: "warn" },
      ],
    },
    {
      kind: "sequence",
      caption: "Calls made, from opening the list to one check-in tap",
      actors: ["Phone", "Database"],
      rows: [
        { from: "Phone", to: "Database", label: "Ongoing: every column of this organisation's published events", note: "includes rsvp — this is the copy check-in will use", state: "derived" },
        { from: "Phone", to: "Database", label: "Details: rsvp for this one event", state: "derived" },
        { from: "Phone", to: "Database", label: "Details: id and picture of each student in it", state: "derived" },
        { from: "Phone", to: "Database", label: "Tap: update events set rsvp = <whole edited text>", note: "no read first", state: "derived" },
        { from: "Database", to: "Phone", label: "the updated row", note: "becomes the screen's copy for the next tap", state: "derived" },
      ],
    },
  ],
  issues: [
    {
      title: "Checking someone in can erase newer RSVPs",
      detail:
        "The first tap writes back a guest list loaded when the Ongoing list was opened. Anyone who joined or changed their booking since then is silently removed from the event.",
      where: "app/org/index/attendees.tsx:99",
    },
  ],
  edges: [
    { from: "ci-details", to: "ci-list", state: "derived", label: "View all", order: 1 },
    { from: "ci-list", to: "ci-tap", state: "derived", label: "tap a person", order: 2 },
  ],
  children: [
    {
      id: "ci-data",
      title: "What An RSVP Holds",
      sub: "One entry per student in the event's guest-list text",
      footprint: { dirs: ["app/individual/index/components/rsvpDrawer.tsx", "app/org/index/attendees.tsx"], files: 2 },
      state: "derived",
      col: 0,
      row: 0,
      detail: `When a student joins, the join drawer reads the event's \`rsvp\` text, parses it, sets the entry under the student's user id, and writes the whole text back. The entry holds the name and contact they typed, how many people they are bringing, and their dietary needs. \`checkedIn\` is not there at first; it appears the first time the organiser taps the person.

Dietary needs are picked from six fixed options, stored with their emoji. "Other" opens a text box; whatever is typed is split on commas and each piece is stored as its own need, while the word "Other" itself is dropped.

The student's own profile keeps a separate list, \`individual.rsvp\`, of the event ids they joined. Check-in never touches it.`,
      code: [
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 145, end: 170, label: "Joining sets one entry under the student's id" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 82, end: 90, label: "The dietary options" },
        { file: "app/individual/index/components/rsvpDrawer.tsx", start: 284, end: 298, label: "Other: typed text, split on commas" },
        { file: "app/org/index/attendees.tsx", start: 32, end: 40, label: "The fields the organiser's screen reads" },
        { file: "lib/localStorage.ts", start: 49, end: 53, label: "The student feed downloads every column, rsvp included" },
      ],
      anatomy: [
        {
          kind: "example",
          caption: "What events.rsvp holds (example, two students)",
          value: `{
  "6f1c2a…a2": {
    "fullName": "Maya Chen",
    "email": "maya@illinois.edu",
    "partySize": 2,
    "dietaryRestrictions": ["🥕 Vegan"],
    "checkedIn": true
  },
  "b93e71…07": {
    "fullName": "Leo Park",
    "email": "leo@illinois.edu",
    "partySize": 1,
    "dietaryRestrictions": ["🕌 Halal", "no shellfish"]
  }
}`,
          notes: [
            { label: "keys", value: "each student's user id — the same id as their login", state: "derived" },
            { label: "stored as", value: "text, not a JSON column: every reader parses it, every writer stringifies the whole object", state: "derived" },
            { label: "\"no shellfish\"", value: "typed under Other", state: "derived" },
          ],
        },
        {
          kind: "table",
          caption: "The fields of one entry",
          columns: ["Field", "What it is", "Written by"],
          state: "derived",
          rows: [
            ["(key)", "The student's user id", "Join drawer"],
            ["fullName", "Name typed in the join drawer", "Join drawer"],
            ["email", "\"email or phone number\", as typed", "Join drawer"],
            ["partySize", "People coming, 1 or more", "Join drawer"],
            ["dietaryRestrictions", "List of needs, emoji included", "Join drawer"],
            ["checkedIn", "Arrived? Missing until first tap", "Organiser's check-in tap"],
          ],
        },
        {
          kind: "table",
          caption: "Dietary options",
          columns: ["Shown and stored as"],
          state: "derived",
          rows: [
            ["🥗 Vegetarian"],
            ["🕌 Halal"],
            ["🌾 Gluten-free"],
            ["🥛 Dairy-free"],
            ["🥕 Vegan"],
            ["🥜 Peanut"],
            ["Other → the typed words, one per comma"],
          ],
        },
      ],
      issues: [
        {
          title: "Every student downloads every guest list",
          detail:
            "The student feed asks for every column of every event on the campus, and `rsvp` is one of them. Each student's phone receives the names, emails and user ids of everyone who joined any event there.",
          where: "lib/localStorage.ts:51",
        },
      ],
    },
    {
      id: "ci-details",
      title: "Event Details Page",
      sub: "The organiser's view of one event, with a headcount and faces",
      footprint: { dirs: ["app/org/index/eventdetails.tsx"], files: 1 },
      state: "derived",
      col: 0,
      row: 1,
      detail: `Opened from the Ongoing or Archive list (or from search). It shows the event much like the preview, then an "Attendees" section. For that section it fetches \`rsvp\` again, then asks the \`individual\` table for the picture of each student in it.

The headcount in "Attendees (N)" is the sum of everyone's \`partySize\` — people, not bookings. Up to seven pictures are shown, then the first three names and "and N more are coming". Students whose profile no longer exists are left out of this section, because it is built from the profiles that came back.

"View all" opens the Attendees screen, handing it two things: the event object this page was opened with (the list's older copy) and the attendee list it just built.`,
      code: [
        { file: "app/org/index/eventdetails.tsx", start: 145, end: 187, label: "Fetch rsvp, then each student's picture" },
        { file: "app/org/index/eventdetails.tsx", start: 189, end: 192, label: "Headcount: sum of party sizes" },
        { file: "app/org/index/eventdetails.tsx", start: 199, end: 201, label: "View all hands over the old event and the new list" },
        { file: "app/org/index/eventdetails.tsx", start: 304, end: 374, label: "Date is only shown when there is a dress code" },
        { file: "app/org/index/eventdetails.tsx", start: 445, end: 469, label: "The Attendees section" },
      ],
      anatomy: [
        {
          kind: "screen",
          title: "Event details (organisation)",
          items: [
            { type: "heading", label: "Event name" },
            { type: "image", label: "Cover picture, full width" },
            { type: "list", label: "Category chips" },
            { type: "button", label: "📍 Address", note: "opens Apple Maps or Google Maps" },
            { type: "text", label: "📅 Date   ⏰ start – end", note: "date only appears if a dress code was given" },
            { type: "text", label: "Name and description", note: "three lines, then \"more\"" },
            { type: "text", label: "Organizer: picture and name" },
            { type: "text", label: "Food & Beverages, Dress Code", note: "each only if set" },
            { type: "heading", label: "Attendees (N)", note: "N = total party size" },
            { type: "button", label: "View all", note: "opens the Attendees screen" },
            { type: "list", label: "Up to 7 profile pictures" },
            { type: "text", label: "\"Maya, Leo, Sam and 4 more are coming\"" },
          ],
        },
      ],
      issues: [
        {
          title: "No date when there is no dress code",
          detail:
            "The layout has two versions, and the one used when the dress code is empty shows the address and time but not the date.",
          where: "app/org/index/eventdetails.tsx:343",
        },
      ],
    },
    {
      id: "ci-list",
      title: "Attendee List Screen",
      sub: "Everyone who joined, their party size, and a tally of dietary needs",
      footprint: { dirs: ["app/org/index/attendees.tsx"], files: 1 },
      state: "derived",
      col: 0,
      row: 2,
      detail: `The screen parses the event's \`rsvp\` text into one row per student, with \`checkedIn\` defaulting to false. The title, "Attendees (N)", is again the sum of party sizes.

Above the list is a row of dietary chips such as "🥕 Vegan (2)". Each count is the number of bookings that listed that need, not the number of people: a party of four with one vegan counts once, as does a party of one. If nobody listed anything, it says "No dietary restrictions".

Each person's row shows a picture, name, email, party size and — once checked in — a green tick. The pictures are not looked up by person: row 1 gets the first picture from the details page's list, row 2 the second, and so on.`,
      code: [
        { file: "app/org/index/attendees.tsx", start: 58, end: 95, label: "Parse the guest list and tally dietary needs" },
        { file: "app/org/index/attendees.tsx", start: 129, end: 132, label: "Title count: sum of party sizes" },
        { file: "app/org/index/attendees.tsx", start: 150, end: 221, label: "The screen" },
        { file: "app/org/index/attendees.tsx", start: 188, end: 191, label: "Pictures taken by position, not by person" },
      ],
      anatomy: [
        {
          kind: "screen",
          title: "Attendees (N)",
          items: [
            { type: "button", label: "← Back", note: "returns to details with the latest copy" },
            { type: "heading", label: "Dietary Restrictions" },
            { type: "list", label: "🥕 Vegan (2)  🕌 Halal (1)  no shellfish (1)", note: "or \"No dietary restrictions\"" },
            { type: "heading", label: "Attendee List" },
            { type: "list", label: "Picture · name · email · party size · ✓", note: "tapping a row checks the person in, or out" },
          ],
        },
        {
          kind: "table",
          caption: "The tally for three bookings",
          columns: ["Booking", "Party size", "Needs listed"],
          state: "derived",
          rows: [
            ["Maya", "4", "🥕 Vegan"],
            ["Leo", "1", "🥕 Vegan, 🕌 Halal"],
            ["Sam", "2", "none"],
            ["Shown", "Attendees (7)", "🥕 Vegan (2) · 🕌 Halal (1)"],
          ],
        },
      ],
      issues: [
        {
          title: "Pictures can belong to someone else",
          detail:
            "Row N takes the Nth picture from the details page, whose list comes back from the database in its own order and only for students who still have a profile. Faces can sit next to the wrong names, and if this screen's copy has more people than that list — someone cancelled, or deleted their account — the screen crashes on the extra row.",
          where: "app/org/index/attendees.tsx:190",
        },
        {
          title: "Dietary counts are per booking, not per person",
          detail:
            "A party of four with one vegan adds one to Vegan, the same as a party of one. An organiser ordering food from these numbers can only guess how many plates each need applies to.",
          where: "app/org/index/attendees.tsx:83",
        },
      ],
    },
    {
      id: "ci-tap",
      title: "Marking Someone Arrived",
      sub: "One tap flips a person's checkedIn flag and rewrites the whole guest list",
      footprint: { dirs: ["app/org/index/attendees.tsx", "app/org/index/eventdetails.tsx", "app/org/index/components/ongoing.tsx"], files: 3 },
      group: { ordering: "sequence" },
      state: "partial",
      unsure:
        "Whether the database lets one organisation write another organisation's event depends on its row-level security rules, which live in the Supabase dashboard and not in this repository.",
      col: 0,
      row: 3,
      detail: `The tap handler parses the screen's copy of \`rsvp\`, flips \`checkedIn\` on that one person, and saves the whole object back with a single update. It does not read the column first. Tapping again checks the person out.

The screen's copy starts as the event row loaded by the Ongoing list, passed through the details page unchanged. After a successful tap the database returns the updated row and that becomes the copy, so each later tap writes the list as it was at the previous tap. Students who join in between are erased by the next tap. The join drawer is safer only by timing: it reads the column just before writing it, so its window for the same mistake is a fraction of a second rather than the whole session.

Nothing checks that the event belongs to the organiser. The organisation's search screen lists every event on the campus and opens the same details page, so another organisation's guest list can be opened and tapped.`,
      code: [
        { file: "app/org/index/attendees.tsx", start: 42, end: 45, label: "The screen starts from the event it was handed" },
        { file: "app/org/index/components/ongoing.tsx", start: 46, end: 46, label: "…which the Ongoing list loaded, rsvp and all" },
        { file: "app/org/index/attendees.tsx", start: 97, end: 123, label: "Flip the flag, write the whole text, keep the reply" },
        { file: "app/org/index/search.tsx", start: 81, end: 83, label: "Search opens any campus event in the same details page" },
      ],
      anatomy: [
        {
          kind: "flow",
          rows: [
            { n: 1, title: "Start from a copy", detail: "The event row the Ongoing list loaded, handed on by the details page.", state: "derived" },
            { n: 2, title: "Flip the flag", detail: "checkedIn = !checkedIn on that person's entry.", state: "derived" },
            { n: 3, title: "Write it all back", detail: "The whole edited object replaces the rsvp column, with no read first.", state: "derived" },
            { n: 4, title: "Keep the reply", detail: "The updated row becomes the copy for the next tap.", state: "derived" },
          ],
        },
        {
          kind: "sequence",
          caption: "How a student's RSVP is erased",
          actors: ["Organiser", "Database", "Student"],
          rows: [
            { from: "Organiser", to: "Database", label: "opens Ongoing — guest list is { Maya }", state: "derived" },
            { from: "Student", to: "Database", label: "Leo joins: reads { Maya }", state: "derived" },
            { from: "Student", to: "Database", label: "writes { Maya, Leo }", state: "derived" },
            { from: "Organiser", to: "Database", label: "taps Maya: writes { Maya ✓ } from its copy", state: "derived" },
            { from: "Database", to: "Organiser", label: "{ Maya ✓ } — Leo is gone", note: "Leo's app still shows the event as joined", state: "derived" },
          ],
        },
      ],
      issues: [
        {
          title: "A tap overwrites newer RSVPs",
          detail:
            "The update writes the screen's copy of the whole guest list without reading the current one. Anyone who joined, cancelled or changed their party since the copy was taken is reverted — joiners disappear from the event, though their own app still says they joined.",
          where: "app/org/index/attendees.tsx:102",
        },
        {
          title: "Other organisations' guest lists are tappable",
          detail:
            "From the organisation's search, any campus event opens the same details and Attendees screens, and the tap updates the event by id alone. Unless the database's own rules refuse it, one organisation can check people in — or erase RSVPs — at another's event.",
          where: "app/org/index/search.tsx:82",
        },
      ],
    },
  ],
};
