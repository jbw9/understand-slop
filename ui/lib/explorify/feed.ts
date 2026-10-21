import type { Node } from "@/lib/data";
/* ═══ 4. FINDING EVENTS ═══════════════════════════════════════
   The student's home screen. The root carries the whole picture (where the
   events come from and every place that reads them); each child is one part
   a newcomer would ask about, with its real values as data. Two levels is
   all this needs — nothing below a child explains more than the child. */
export const feed: Node = {
  id: "feed",
  title: "Finding Events",
  sub: "The student's home screen: upcoming events at their nearest university, ranked and searchable",
  footprint: {
    dirs: ["app/individual/index/", "lib/localStorage.ts"],
    files: 9,
  },
  group: {
    ordering: "set",
    note: "Pick a university, download its events, keep a copy on the phone — the last three all read that copy.",
  },
  shape: { kind: "marks", ids: ["expo", "supabase"], note: "expo-location for GPS, Supabase for the events" },
  state: "derived",
  col: 0,
  row: 3,
  detail: `When a student opens the app they land on Home. Home first settles which university they are at — from the phone's GPS, or from a list they pick from — then downloads every published, upcoming event for that university in one query and keeps a copy on the phone.

Everything on Home reads that copy. "You might like" scores it against the student's interests and a few other rules and shows the best eight; "Happening this week" shows the first eight by date; Search filters it as you type. Tapping any card opens the event's page, where Join starts an RSVP (see Joining And Saving).

The copy is downloaded on Home's first visit, on pull-to-refresh, and when the university changes — coming back to Home later does not download again. Fetching once and filtering on the phone keeps search instant; the cost is that every column of every event, including its guest list, lands on every student's phone.`,
  code: [
    { file: "app/individual/index/index.tsx", start: 104, end: 128, label: "What Home does on its first visit" },
    { file: "app/individual/index/index.tsx", start: 60, end: 71, label: "Download a university's events, then show the copy" },
    { file: "app/individual/index/index.tsx", start: 93, end: 102, label: "Pull to refresh" },
    { file: "app/individual/index/index.tsx", start: 385, end: 391, label: "Both rows get the same events" },
    { file: "app/individual/index/components/upcoming.tsx", start: 38, end: 40, label: "\"Happening this week\" is the first eight" },
  ],
  anatomy: [
    {
      kind: "diagram",
      caption: "Where Home's events come from, and everything that reads them",
      boxes: [
        { id: "gps", label: "Phone's GPS", sub: "nearest of 61", col: 0, row: 0 },
        { id: "pick", label: "Campus picker", sub: "student chooses", col: 0, row: 2 },
        { id: "fetch", label: "Download events", sub: "published, this university", col: 1, row: 1 },
        { id: "copy", label: "Copy on the phone", sub: "saved as \"events\"", col: 2, row: 1 },
        { id: "guests", label: "Everyone's RSVPs", sub: "names, contacts, diets", col: 2, row: 3, tone: "warn" },
        { id: "yml", label: "You Might Like", sub: "scored, best 8", col: 3, row: 0 },
        { id: "week", label: "Happening This Week", sub: "first 8 by date", col: 3, row: 1 },
        { id: "search", label: "Search", sub: "filters the copy", col: 3, row: 2 },
        { id: "page", label: "Event page", sub: "details, who is going", col: 4, row: 1 },
        { id: "join", label: "RSVP drawer", sub: "Joining And Saving", col: 5, row: 1, tone: "good" },
      ],
      arrows: [
        { from: "gps", to: "fetch", label: "university" },
        { from: "pick", to: "fetch", label: "university" },
        { from: "fetch", to: "copy" },
        { from: "fetch", to: "guests", label: "comes along", tone: "warn" },
        { from: "copy", to: "yml" },
        { from: "copy", to: "week" },
        { from: "copy", to: "search" },
        { from: "yml", to: "page", label: "tap" },
        { from: "week", to: "page" },
        { from: "search", to: "page" },
        { from: "page", to: "join", label: "Join", tone: "good" },
      ],
    },
    {
      kind: "screen",
      title: "Home",
      caption: "What the student sees, top to bottom",
      items: [
        { type: "heading", label: "Hello, Ana!", note: "first word of the cached full name" },
        { type: "button", label: "Exploring events at UIUC ▾", note: "the short name; tap to open the campus picker" },
        { type: "image", label: "Profile picture", note: "only if one is set" },
        { type: "field", label: "Search for an event...", note: "opens Search" },
        { type: "heading", label: "You might like 🤩" },
        { type: "button", label: "View more", note: "every scored event, same order" },
        { type: "list", label: "Up to 8 large cards", note: "picture, date, place, time, \"N coming\", Join, Save" },
        { type: "heading", label: "Happening this week 🙀" },
        { type: "button", label: "View more", note: "every cached event" },
        { type: "list", label: "Up to 8 rows", note: "the first eight by date, with Join and Save" },
      ],
    },
    {
      kind: "sequence",
      caption: "What Home asks Supabase for on its first visit",
      actors: ["Phone", "Supabase"],
      rows: [
        { from: "Phone", to: "Supabase", label: "who is signed in?", state: "derived" },
        { from: "Phone", to: "Supabase", label: "my RSVP list, then my saved list", note: "kept on Home, never used by the buttons", state: "derived" },
        { from: "Phone", to: "Phone", label: "GPS → nearest university", state: "derived" },
        { from: "Phone", to: "Supabase", label: "every published event at this university", state: "derived" },
        { from: "Supabase", to: "Phone", label: "all columns, oldest first", state: "derived" },
        { from: "Phone", to: "Phone", label: "drop past days, save the copy", state: "derived" },
        { from: "Phone", to: "Supabase", label: "per large card: its RSVPs and faces", note: "two queries per card", state: "derived" },
        { from: "Phone", to: "Supabase", label: "per Save button: my saved list", note: "one query per button", state: "derived" },
      ],
    },
  ],
  issues: [
    {
      title: "\"Happening this week\" is not this week",
      detail:
        "The row takes the first eight cached events by date, however far away they are. A university with nothing on for a month still shows eight events under this heading.",
      where: "app/individual/index/components/upcoming.tsx:40",
    },
    {
      title: "Links to an event open a placeholder",
      detail:
        "Home sends an incoming app link to `/individual/<path>`. The screen at `event/[id]` downloads the event and then only prints \"Event Details\" and the id — none of the event is shown.",
      where: "app/individual/index/event/[id].tsx:51",
    },
  ],
  children: [
    {
      id: "fd-campus",
      title: "Picking The University",
      sub: "GPS finds the nearest of 61 universities; a picker lets the student choose another",
      footprint: {
        dirs: ["app/individual/index/index.tsx", "app/individual/index/components/universityList.tsx", "app/org/index/editEvent/campusDrawer.tsx"],
        files: 3,
      },
      shape: { kind: "count", value: "61", unit: "universities to choose from" },
      state: "derived",
      col: 0,
      row: 0,
      detail: `Every event belongs to one university, stored as its full name in \`events.campus\`, so Home must settle on one before it can show anything. On the first visit it asks for location permission. If granted, it measures the straight-line distance from the phone to each of the 61 universities in \`universityList.tsx\` and takes the closest — however far away that is. The distance formula (haversine) is written out by hand in \`index.tsx\`.

If permission is refused, an alert offers the picker ("OK") or asks again ("Try Again"). The picker also opens when the student taps the university name in the header. It is the organisation side's \`CampusDrawer\`, reused: the same 61, sorted by distance from the current choice, with a search box matching the full or short name. Choosing one downloads that university's events at once.

The header shows the short name; the query uses the full name. The choice lives only in the screen's memory — nothing saves it — so the next launch asks for location again and a hand-picked university is forgotten.`,
      code: [
        { file: "app/individual/index/index.tsx", start: 130, end: 148, label: "Asking for location permission" },
        { file: "app/individual/index/index.tsx", start: 150, end: 173, label: "Picking the nearest university by GPS" },
        { file: "app/individual/index/index.tsx", start: 179, end: 196, label: "Straight-line distance, written by hand" },
        { file: "app/individual/index/index.tsx", start: 73, end: 91, label: "Applying a university picked by hand" },
        { file: "app/org/index/editEvent/campusDrawer.tsx", start: 95, end: 106, label: "Choosing one in the picker" },
        { file: "app/org/index/editEvent/campusDrawer.tsx", start: 118, end: 143, label: "Sorting by distance and searching" },
        { file: "app/individual/index/components/universityList.tsx", start: 1, end: 368, label: "The list of 61" },
      ],
      anatomy: [
        {
          kind: "diagram",
          caption: "How Home settles on a university",
          boxes: [
            { id: "open", label: "Home opens", sub: "first visit only", col: 0, row: 1 },
            { id: "perm", label: "Location allowed?", col: 1, row: 1 },
            { id: "gps", label: "Nearest of 61", sub: "straight-line distance", col: 2, row: 0 },
            { id: "alert", label: "Alert", sub: "OK or Try Again", col: 2, row: 2 },
            { id: "header", label: "Header tap", sub: "\"Exploring events at …\"", col: 2, row: 3 },
            { id: "picker", label: "Campus picker", sub: "sorted by distance", col: 3, row: 2 },
            { id: "chosen", label: "University chosen", sub: "full name, in memory", col: 4, row: 1, tone: "good" },
            { id: "fetch", label: "Download its events", col: 5, row: 1 },
            { id: "next", label: "Next launch", sub: "asks all over again", col: 4, row: 3, tone: "warn" },
          ],
          arrows: [
            { from: "open", to: "perm" },
            { from: "perm", to: "gps", label: "yes" },
            { from: "perm", to: "alert", label: "no" },
            { from: "alert", to: "picker", label: "OK" },
            { from: "header", to: "picker" },
            { from: "gps", to: "chosen" },
            { from: "picker", to: "chosen", label: "pick" },
            { from: "chosen", to: "fetch" },
            { from: "chosen", to: "next", label: "not saved", tone: "warn" },
          ],
        },
        {
          kind: "table",
          caption: "The 61 universities, in the order the file lists them — the first is the starting point before GPS answers",
          columns: ["University (stored as)", "Header shows", "Latitude, longitude"],
          state: "derived",
          rows: [
            ["University of Illinois Urbana-Champaign", "UIUC", "40.102, -88.2272"],
            ["University of Washington", "UW", "47.6553, -122.3035"],
            ["Stanford University", "Stanford", "37.4275, -122.1697"],
            ["University of California, Berkeley", "UC Berkeley", "37.8719, -122.2585"],
            ["Massachusetts Institute of Technology", "MIT", "42.3601, -71.0942"],
            ["Harvard University", "Harvard", "42.377, -71.1167"],
            ["Yale University", "Yale", "41.3163, -72.9223"],
            ["Princeton University", "Princeton", "40.3431, -74.6551"],
            ["Columbia University", "Columbia", "40.8075, -73.9626"],
            ["University of Chicago", "UChicago", "41.7886, -87.5987"],
            ["California Institute of Technology", "Caltech", "34.1377, -118.1253"],
            ["University of Pennsylvania", "UPenn", "39.9522, -75.1932"],
            ["Cornell University", "Cornell", "42.4534, -76.4735"],
            ["Duke University", "Duke", "36.0014, -78.9382"],
            ["University of Michigan", "U-M", "42.278, -83.7382"],
            ["Northwestern University", "NU", "42.0565, -87.6753"],
            ["Johns Hopkins University", "JHU", "39.3299, -76.6205"],
            ["University of California, Los Angeles", "UCLA", "34.0689, -118.4452"],
            ["University of Southern California", "USC", "34.0224, -118.2851"],
            ["New York University", "NYU", "40.7295, -73.9965"],
            ["University of Texas at Austin", "UT Austin", "30.2849, -97.7341"],
            ["University of Wisconsin-Madison", "UW-Madison", "43.0766, -89.4125"],
            ["University of North Carolina at Chapel Hill", "UNC", "35.9049, -79.0469"],
            ["Georgia Institute of Technology", "Georgia Tech", "33.7756, -84.3963"],
            ["University of Florida", "UF", "29.6436, -82.3549"],
            ["Ohio State University", "OSU", "40.0068, -83.0306"],
            ["Pennsylvania State University", "Penn State", "40.7982, -77.8599"],
            ["University of Virginia", "UVA", "38.0336, -78.507"],
            ["University of California, San Diego", "UCSD", "32.8801, -117.234"],
            ["University of Maryland, College Park", "UMD", "38.9869, -76.9426"],
            ["University of California, Santa Barbara", "UCSB", "34.4133, -119.861"],
            ["University of California, Irvine", "UCI", "33.6465, -117.8426"],
            ["University of California, Davis", "UC Davis", "38.5382, -121.7617"],
            ["University of Minnesota", "UMN", "44.9738, -93.2277"],
            ["Purdue University", "Purdue", "40.4237, -86.9212"],
            ["University of Arizona", "UA", "32.2319, -110.9501"],
            ["Texas A&M University", "TAMU", "30.6219, -96.3423"],
            ["Indiana University Bloomington", "IU", "39.167, -86.5343"],
            ["Michigan State University", "MSU", "42.7024, -84.4802"],
            ["University of Colorado Boulder", "CU Boulder", "40.0076, -105.2659"],
            ["University of Iowa", "UIowa", "41.6611, -91.536"],
            ["University of Miami", "UM", "25.7216, -80.2793"],
            ["University of Pittsburgh", "Pitt", "40.4444, -79.9532"],
            ["University of Utah", "U of U", "40.7649, -111.8421"],
            ["University of Connecticut", "UConn", "41.8084, -72.2495"],
            ["University of Oklahoma", "OU", "35.207, -97.4458"],
            ["University of South Carolina", "UofSC", "33.9986, -81.0275"],
            ["University of Kansas", "KU", "38.9558, -95.255"],
            ["University of Alabama", "UA", "33.214, -87.5391"],
            ["University of Kentucky", "UK", "38.0385, -84.5037"],
            ["University of Tennessee", "UTK", "35.9546, -83.9295"],
            ["University of Missouri", "Mizzou", "38.9404, -92.3277"],
            ["University of Oregon", "UO", "44.0448, -123.0726"],
            ["University of Massachusetts Amherst", "UMass", "42.3868, -72.5293"],
            ["University of Mississippi", "Ole Miss", "34.3647, -89.5383"],
            ["University of Nebraska-Lincoln", "UNL", "40.8202, -96.7006"],
            ["University of Nevada, Las Vegas", "UNLV", "36.1073, -115.1441"],
            ["University of Hawaii at Manoa", "UH Manoa", "21.297, -157.817"],
            ["University of New Mexico", "UNM", "35.0844, -106.6198"],
            ["University of Arkansas", "UArk", "36.0687, -94.1768"],
            ["University of Delaware", "UD", "39.678, -75.7526"],
          ],
        },
      ],
      issues: [
        {
          title: "The university is forgotten on every launch",
          detail:
            "`campus` and `isLocationManuallySet` are plain component state. A student who picked a university by hand is asked for location again next time, and GPS may land them somewhere else.",
          where: "app/individual/index/index.tsx:50",
        },
        {
          title: "Two universities both show as \"UA\"",
          detail:
            "Arizona and Alabama share the short name, so the header reads \"UA\" for either. The query uses the full name, so the events are right — only the label is ambiguous.",
          where: "app/individual/index/components/universityList.tsx:291",
        },
      ],
    },
    {
      id: "fd-fetch",
      title: "Downloading The Events",
      sub: "One query per university; past days dropped; the result saved on the phone",
      footprint: { dirs: ["lib/localStorage.ts"], files: 1 },
      group: { ordering: "sequence" },
      state: "derived",
      col: 0,
      row: 1,
      detail: `\`fetchAllEvents(campus)\` in \`lib/localStorage.ts\` asks Supabase for every event whose \`published\` is true and whose \`campus\` is exactly the university's full name, oldest first. It asks for every column (\`select("*")\`), not just the ones the cards draw.

The phone then throws away events dated before today and saves the rest under the key \`events\`, replacing what was there. Home reads that copy back and hands it to both rows; Search reads it too. If the download fails the function only returns \`false\`, and Home quietly shows whatever copy it had before.

Home is not the only caller. Student sign-up primes the copy with \`"UIUC"\`, and the organisation side's Other Events tab uses the same function and the same key with the organisation's campus.`,
      code: [
        { file: "lib/localStorage.ts", start: 42, end: 76, label: "Downloading and saving a university's events" },
        { file: "lib/localStorage.ts", start: 49, end: 54, label: "The query" },
        { file: "lib/localStorage.ts", start: 65, end: 71, label: "Dropping past days and saving the copy" },
        { file: "app/individual/index/index.tsx", start: 60, end: 71, label: "Home reads the copy back" },
        { file: "app/(auth)/registerIndividual.tsx", start: 160, end: 161, label: "Sign-up primes it with \"UIUC\"" },
        { file: "app/org/otherevents/index.tsx", start: 74, end: 85, label: "The organisation side uses the same copy" },
      ],
      anatomy: [
        {
          kind: "flow",
          rows: [
            { n: 1, title: "Ask for this university's events", detail: "published = true and campus = the full university name, exact text, oldest first, every column.", state: "derived" },
            { n: 2, title: "Drop past days", detail: "Done on the phone after the download: keep events dated today or later.", state: "derived" },
            { n: 3, title: "Save them on the phone", detail: "The whole list, every column — guest lists included — under the key \"events\".", state: "derived" },
            { n: 4, title: "Show them", detail: "Home reads the copy back and passes it to You Might Like and Happening This Week.", state: "derived" },
          ],
        },
        {
          kind: "table",
          caption: "What the query asks for",
          columns: ["Condition", "Value", "What it means"],
          state: "derived",
          rows: [
            ["published", "true", "drafts never reach students"],
            ["campus", "the full university name", "exact text: an event saved with an empty or different campus is invisible"],
            ["order", "date, oldest first", "Happening This Week is simply the first eight of this"],
            ["columns", "all of them", "the guest list comes along — see Stored On The Phone"],
            ["date ≥ today", "applied on the phone", "past events are downloaded, then thrown away"],
          ],
        },
        {
          kind: "table",
          caption: "Every time the copy is replaced",
          columns: ["When", "University used", "Where"],
          state: "derived",
          rows: [
            ["Home's first visit", "the GPS-nearest", "index.tsx:169"],
            ["Pull to refresh on Home", "the current one", "index.tsx:97"],
            ["A university picked by hand", "the picked one", "index.tsx:82"],
            ["End of student sign-up", "\"UIUC\" — matches nothing, so an empty list until Home replaces it", "registerIndividual.tsx:161"],
            ["Organisation's Other Events tab", "the organisation's campus", "org/otherevents/index.tsx:77"],
          ],
        },
      ],
      issues: [
        {
          title: "Events with a mismatched campus are invisible",
          detail:
            "The match is exact text. An event whose campus was saved empty, abbreviated or spelled differently is never downloaded by any student, and nothing tells the organisation.",
          where: "lib/localStorage.ts:53",
        },
        {
          title: "Coming back to Home shows the old list",
          detail:
            "The download runs only on Home's first visit, on pull-to-refresh, or on a university change. An event published while the app is open appears only after the student pulls to refresh or restarts.",
          where: "app/individual/index/index.tsx:107",
        },
      ],
    },
    {
      id: "fd-cache",
      title: "Stored On The Phone",
      sub: "What the app keeps in the phone's storage, and under which names",
      footprint: { dirs: ["lib/localStorage.ts", "lib/supabase.ts"], files: 2 },
      state: "derived",
      col: 0,
      row: 2,
      detail: `The app keeps a few things in AsyncStorage, the phone's simple key–value store, so screens can read them without asking Supabase every time. \`lib/localStorage.ts\` wraps it: \`storeData\` saves any value as JSON text, \`retrieveData\` reads it back, and both swallow errors and return \`false\` or \`null\`.

Supabase's client keeps the login session in the same store — \`lib/supabase.ts\` passes \`AsyncStorage\` as its storage — so signing out with \`AsyncStorage.clear()\` wipes the session and every copy at once.

A copy is only as fresh as its last download. The \`user\` copy is refreshed at launch, at sign-in and whenever an event page opens; editing interests on the profile changes the database but not this copy.`,
      code: [
        { file: "lib/localStorage.ts", start: 5, end: 30, label: "Saving and reading a key" },
        { file: "lib/localStorage.ts", start: 108, end: 136, label: "Downloading your profile into \"user\"" },
        { file: "lib/supabase.ts", start: 9, end: 16, label: "The login session lives in the same store" },
        { file: "app/individual/account/index.tsx", start: 69, end: 79, label: "Signing out clears everything" },
        { file: "app/individual/account/index.tsx", start: 51, end: 59, label: "After editing interests: reads the old copy" },
      ],
      anatomy: [
        {
          kind: "table",
          caption: "Everything the app keeps on the phone",
          columns: ["Key", "What it holds", "Written by", "Read by"],
          state: "derived",
          rows: [
            ["events", "this university's upcoming events, every column", "the download (Home, sign-up, Other Events)", "Home, both Search screens, Other Events"],
            ["user", "your whole profile row", "launch, sign-in, sign-up, opening an event page, a new profile picture", "almost every screen: your id, name, email, interests"],
            ["uuid", "your user id", "launch, sign-in, sign-up", "the profile download"],
            ["tempPassword", "the made-up password used during sign-up", "sign-up, step 2", "removed when sign-up finishes"],
            ["(Supabase's own key)", "the login session tokens", "the Supabase client", "every request"],
          ],
        },
        {
          kind: "example",
          caption: "One event as saved under \"events\" (values invented; field names are the app's)",
          value: `[
  {
    "id": 42,
    "uuid": "9f1c…",              ← the organisation's user id
    "name": "Robotics Night",
    "campus": "University of Illinois Urbana-Champaign",
    "date": "2026-10-23",
    "time": "18:30:00",
    "end_time": "20:00:00",
    "location": { "description": "Siebel Center…", "terms": [ … ] },
    "room_number": "1404",
    "type": ["stem"],
    "food": "Yes, Pizza",
    "dress_code": "Casual",
    "thumbnail": "https://…/event_thumbnail/1729….jpg",
    "published": true,
    "rsvp": "{\\"3b7e…\\":{\\"fullName\\":\\"Ana Ruiz\\",\\"email\\":\\"ana@illinois.edu\\",\\"partySize\\":2,\\"dietaryRestrictions\\":[\\"🥗 Vegetarian\\"]}}"
  }
]`,
          notes: [
            { label: "rsvp", value: "every attendee's name, contact, party size and diet — on every student's phone at this university", state: "derived" },
          ],
        },
      ],
      issues: [
        {
          title: "Every attendee's details are on every student's phone",
          detail:
            "The download asks for every column, so `rsvp` — each attendee's full name, email or phone, party size and dietary needs — is saved on the phone of every student who opens Home at that university, readable by anyone with the device or a debugger.",
          where: "lib/localStorage.ts:51",
        },
        {
          title: "Edited interests don't reach You Might Like",
          detail:
            "Saving interests on the profile updates the database, then re-reads only the phone copy. You Might Like keeps scoring with the old interests until the student opens an event page or relaunches.",
          where: "app/individual/account/components/EditProfileDrawer.tsx:107",
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
      unsure:
        "The same-city rule reads `location.city` from the student's profile. Nothing in the app writes it; whether someone fills it by hand in the Supabase dashboard cannot be seen from the repo, so the rule is treated here as never firing.",
      col: 0,
      row: 3,
      detail: `The only ranking in the app. Whenever Home's event list changes, \`youmightlike.tsx\` reads your profile from the phone copy, drops events whose date has passed, gives each remaining event a score out of 13 and sorts highest first. The row shows the top eight; View more shows them all in the same order.

The score is the sum of five independent rules (below). The heaviest is interests: the share of *your* interests the event is tagged with, times 5 — so a student with two interests gets 2.5 for one match. The others reward events that are soon, popular, in your city, or in the evening.

Each large card then fetches its own guest list again — the event's \`rsvp\` and the attendees' profile pictures — to draw the faces and the "N coming" count, which adds up party sizes. If no event survives the date check, the row falls back to showing every cached event, unranked.`,
      code: [
        { file: "app/individual/index/components/youmightlike.tsx", start: 48, end: 90, label: "Scoring and sorting" },
        { file: "app/individual/index/components/youmightlike.tsx", start: 55, end: 56, label: "Dropping events whose date has passed" },
        { file: "app/individual/index/components/youmightlike.tsx", start: 59, end: 62, label: "Interests: up to 5 points" },
        { file: "app/individual/index/components/youmightlike.tsx", start: 64, end: 79, label: "Soon, popular, same city, evening" },
        { file: "app/individual/index/components/youmightlike.tsx", start: 130, end: 169, label: "Each card fetches its guest list again" },
        { file: "app/individual/index/components/youmightlike.tsx", start: 270, end: 282, label: "Top eight, or everything if none scored" },
      ],
      anatomy: [
        {
          kind: "table",
          caption: "The five rules, with their exact points",
          columns: ["Rule", "How it is measured", "Points"],
          state: "derived",
          rows: [
            ["Interests", "share of your interests the event is tagged with", "0 to 5 (1 of 2 matching → 2.5)"],
            ["Soon", "whole days until the event", "3 within 7 days · 2 within 14 · 1 within 30"],
            ["Popular", "number of RSVP entries, not people", "2 for 10 or more · 1 for 5 or more"],
            ["Same city", "your profile's city appears in the event's address", "2 — never fires, nothing sets your city"],
            ["Evening", "start hour from 18 to 21", "1"],
            ["Most possible", "", "13 (11 without same city)"],
          ],
        },
        {
          kind: "example",
          caption: "One event, scored (values invented)",
          value: `you:    interests = ["stem", "social"], no location
event:  type = ["stem"], in 5 days, 6 RSVP entries, starts 18:30

interests   1 of your 2 match   → 2.5
soon        5 days away         → 3
popular     6 entries           → 1
same city   no location         → 0
evening     hour 18             → 1
                                  ─────
total                             7.5 of 13`,
        },
        {
          kind: "diagram",
          caption: "How the row is built from the phone copy",
          boxes: [
            { id: "copy", label: "Cached events", col: 0, row: 2 },
            { id: "me", label: "Your profile copy", sub: "interests, location", col: 0, row: 0 },
            { id: "date", label: "Date not passed", sub: "today is already out", col: 1, row: 2, tone: "warn" },
            { id: "r1", label: "Interests", sub: "up to 5", col: 2, row: 0 },
            { id: "r2", label: "Soon", sub: "up to 3", col: 2, row: 1 },
            { id: "r3", label: "Popular", sub: "up to 2", col: 2, row: 2 },
            { id: "r4", label: "Same city", sub: "location never set", col: 2, row: 3, tone: "warn" },
            { id: "r5", label: "Evening", sub: "1", col: 2, row: 4 },
            { id: "sum", label: "Score out of 13", col: 3, row: 2 },
            { id: "top", label: "Top 8 shown", sub: "highest first", col: 4, row: 2, tone: "good" },
            { id: "none", label: "All, unranked", sub: "if none left", col: 4, row: 4, tone: "warn" },
          ],
          arrows: [
            { from: "copy", to: "date" },
            { from: "me", to: "r1" },
            { from: "date", to: "r1" },
            { from: "date", to: "r2" },
            { from: "date", to: "r3" },
            { from: "date", to: "r4" },
            { from: "date", to: "r5" },
            { from: "r1", to: "sum" },
            { from: "r2", to: "sum" },
            { from: "r3", to: "sum" },
            { from: "r4", to: "sum" },
            { from: "r5", to: "sum" },
            { from: "sum", to: "top", tone: "good" },
            { from: "sum", to: "none", label: "nothing scored", tone: "warn" },
          ],
        },
      ],
      issues: [
        {
          title: "Today's events never appear here",
          detail:
            "`new Date(\"2026-10-23\")` is midnight UTC, which on a phone in the Americas is the evening before. By the time the day starts that moment has passed, so today's events fail the check and drop out of this row (Happening This Week still shows them).",
          where: "app/individual/index/components/youmightlike.tsx:56",
        },
        {
          title: "The same-city rule never fires",
          detail:
            "It reads `user.location.city`, but no screen in the app writes a location on a student. Two of the 13 points are unreachable.",
          where: "app/individual/index/components/youmightlike.tsx:73",
        },
        {
          title: "Popularity counts sign-ups, not people",
          detail:
            "The rule counts keys in the guest list, so a party of four counts once — while the card's \"N coming\" adds party sizes. A row can say \"12 coming\" without the event scoring as popular.",
          where: "app/individual/index/components/youmightlike.tsx:69",
        },
        {
          title: "Two extra queries per card",
          detail:
            "Each card re-downloads the event's guest list and its attendees' pictures, although the cached event already holds the guest list. Eight cards make sixteen queries every time the row draws.",
          where: "app/individual/index/components/youmightlike.tsx:133",
        },
      ],
    },
    {
      id: "fd-search",
      title: "Searching Events",
      sub: "Type to filter the cached events; tap categories to narrow them further",
      footprint: { dirs: ["app/individual/index/search.tsx", "app/individual/index/data/categories.ts"], files: 2 },
      state: "derived",
      col: 0,
      row: 4,
      detail: `Search never asks Supabase for events. Each time the screen comes into view it reads the \`events\` copy from the phone, then looks up each event's organiser name — one query per event — so you can search by organiser too.

Typing filters as you go: an event stays if the text appears, ignoring case, in its name, its description, its address, or its organiser's name. The category buttons narrow it further: with any selected, an event stays if it has at least one of them. Both filters apply together.

Because it searches the copy, results are limited to the current university and to upcoming events. The organisation side has its own near-identical screen, \`app/org/index/search.tsx\`.`,
      code: [
        { file: "app/individual/index/search.tsx", start: 48, end: 62, label: "Reading the copy and looking up each organiser" },
        { file: "app/individual/index/search.tsx", start: 113, end: 132, label: "Filtering by text and category" },
        { file: "app/individual/index/search.tsx", start: 219, end: 227, label: "The category buttons" },
        { file: "app/individual/index/data/categories.ts", start: 1, end: 10, label: "The category list" },
      ],
      anatomy: [
        {
          kind: "table",
          caption: "What the text box searches",
          columns: ["Searched", "Comes from"],
          state: "derived",
          rows: [
            ["Event name", "the event"],
            ["Description", "the event"],
            ["Address", "the event's whole location value, as text"],
            ["Organiser name", "the organisation's profile, looked up per event"],
          ],
        },
        {
          kind: "table",
          caption: "The category buttons — an event matches if it has any selected one",
          columns: ["Button", "Matches events tagged"],
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
          kind: "sequence",
          caption: "Opening Search",
          actors: ["Phone", "Supabase"],
          rows: [
            { from: "Phone", to: "Phone", label: "read the \"events\" copy", state: "derived" },
            { from: "Phone", to: "Supabase", label: "organiser name for event 1", state: "derived" },
            { from: "Phone", to: "Supabase", label: "organiser name for event 2", state: "derived" },
            { from: "Phone", to: "Supabase", label: "… one per cached event", state: "derived" },
            { from: "Phone", to: "Phone", label: "filter on every keystroke", state: "derived" },
          ],
        },
      ],
      issues: [
        {
          title: "One query per event, every time Search opens",
          detail:
            "Fifty cached events means fifty organiser lookups each time the screen comes into view, even though the names rarely change.",
          where: "app/individual/index/search.tsx:51",
        },
        {
          title: "Some words match every event",
          detail:
            "The address is searched as the whole stored value turned into text, field names included — so typing \"description\" or \"terms\" matches every event.",
          where: "app/individual/index/search.tsx:122",
        },
      ],
    },
    {
      id: "fd-details",
      title: "The Event Page",
      sub: "Everything about one event, who is going, and the Join button",
      footprint: { dirs: ["app/individual/index/eventdetails.tsx", "app/individual/index/attendees.tsx"], files: 2 },
      state: "derived",
      col: 0,
      row: 5,
      detail: `Tapping any card opens \`eventdetails.tsx\` with the event the card already had — it is not downloaded again. The page then fetches two things: the organiser's profile, for the name and picture, and the guest list, by re-reading the event's \`rsvp\` and looking up each attendee's profile picture.

It shows the picture, category tags, address (tapping opens Apple Maps on iPhone, Google Maps on Android), date and time, the description with Read more, the organiser, food if the \`food\` text starts with "Yes", the dress code, and the attendees: the first three names and a count that adds up party sizes. View all lists every attendee's name and party size. Join at the bottom opens the RSVP drawer — see Joining And Saving.

Every time the page comes into view it re-downloads your profile into the \`user\` copy, the most frequent refresh of that copy anywhere in the app.`,
      code: [
        { file: "app/individual/index/eventdetails.tsx", start: 124, end: 133, label: "Refreshing your profile copy on every visit" },
        { file: "app/individual/index/eventdetails.tsx", start: 135, end: 176, label: "Loading the guest list" },
        { file: "app/individual/index/eventdetails.tsx", start: 178, end: 217, label: "Loading the organiser's whole profile" },
        { file: "app/individual/index/eventdetails.tsx", start: 80, end: 107, label: "Opening the address in Maps" },
        { file: "app/individual/index/eventdetails.tsx", start: 495, end: 536, label: "Attendees and the Join button" },
        { file: "app/individual/index/attendees.tsx", start: 40, end: 110, label: "View all: every attendee" },
      ],
      anatomy: [
        {
          kind: "screen",
          title: "Event page",
          items: [
            { type: "heading", label: "Robotics Night" },
            { type: "button", label: "Bookmark", note: "Save — see Joining And Saving" },
            { type: "image", label: "Event picture" },
            { type: "list", label: "Category tags", note: "e.g. stem" },
            { type: "button", label: "📍 Siebel Center, 1404", note: "opens Maps" },
            { type: "text", label: "Date · 6:30 PM – 8:00 PM" },
            { type: "text", label: "Description", note: "long ones fold behind Read more" },
            { type: "heading", label: "Organizer", note: "picture and name" },
            { type: "heading", label: "Food & Beverages", note: "only if food starts with \"Yes\"" },
            { type: "heading", label: "Dress Code", note: "only if set" },
            { type: "heading", label: "Attendees (N)", note: "N adds up party sizes" },
            { type: "button", label: "View all", note: "every attendee's name and party size" },
            { type: "text", label: "Ana, Ben, Chi and 4 more are coming" },
            { type: "button", label: "Join", note: "opens the RSVP drawer" },
          ],
        },
        {
          kind: "sequence",
          caption: "What the page fetches when it opens",
          actors: ["Phone", "Supabase"],
          rows: [
            { from: "Phone", to: "Supabase", label: "my profile → the \"user\" copy", state: "derived" },
            { from: "Phone", to: "Supabase", label: "the organiser's whole profile", state: "derived" },
            { from: "Phone", to: "Supabase", label: "this event's rsvp", state: "derived" },
            { from: "Phone", to: "Supabase", label: "attendees' ids and pictures", state: "derived" },
          ],
        },
      ],
      issues: [
        {
          title: "The page downloads the organiser's whole profile",
          detail:
            "It selects every column of the organisation's row to show a name and a picture. If the `password` column that password reset writes exists, a student's phone receives the organisation's password in plain text.",
          where: "app/individual/index/eventdetails.tsx:182",
        },
      ],
    },
  ],
};
