import type { Node } from "@/lib/data";
/* ═══ 6. CHECK-IN ═════════════════════════════════════════════
   Five levels: check-in → the tap → the snapshot it writes from → where
   the snapshot came from → the source. */
export const checkIn: Node = {
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
};
