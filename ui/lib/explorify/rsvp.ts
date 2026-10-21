import type { Node } from "@/lib/data";
/* ═══ 5. RSVP ═════════════════════════════════════════════════
   Five levels: joining → button state → joinedEvents → after a restart →
   the source. */
export const rsvp: Node = {
  id: "rsvp",
  title: "RSVP",
  sub: "Swipe up to join; the answer is written into one JSON string on the event",
  footprint: {
    dirs: ["app/individual/index/components/", "app/individual/index/eventdetails.tsx", "app/individual/saved/index.tsx"],
    files: 7,
  },
  group: { ordering: "set", note: "The gesture, where it writes, how it is undone, and what the buttons believe." },
  state: "partial",
  alarm: true,
  col: 0,
  row: 4,
  detail:
    "An RSVP is stored twice: as a key in the event's `rsvp` string, and as an id in the student's `rsvp` array. Every write is read-modify-write from the phone, and the cancel on the Saved tab cannot cancel.",
  evidence: "app/individual/index/components/rsvpDrawer.tsx:134",
  children: [
    {
      id: "rv-swipe",
      title: "Swipe To Join",
      sub: "A drawer for party size and dietary needs, confirmed by dragging up",
      footprint: { dirs: ["app/individual/index/components/rsvpDrawer.tsx", "app/individual/index/components/eventContext.tsx"], files: 2 },
      group: { ordering: "sequence" },
      state: "partial",
      col: 0,
      row: 0,
      detail:
        "The drawer is mounted once, at the app root, by EventProvider. Name and email are taken from the cached profile, not typed.",
      evidence: "app/individual/index/components/rsvpDrawer.tsx:302",
      anatomy: [
        {
          kind: "flow",
          rows: [
            { n: 1, title: "Join opens it", detail: "openRSVPDrawer(event) in the shared context; nothing is written yet.", state: "derived" },
            { n: 2, title: "Party and diet", detail: "Party size, and dietary chips: vegetarian, halal, gluten-free, dairy-free, vegan, peanut, other.", state: "derived" },
            {
              n: 3,
              title: "Drag past 50px",
              detail: "A drag of more than 50 points upward confirms; anything less springs back.",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "app/individual/index/components/rsvpDrawer.tsx",
                  start: 315,
                  code: `      onPanResponderRelease: (_, gestureState) => {
        if (isSwipeDisabled || isKeyboardVisible) return;

        if (gestureState.dy < -50) {
          setIsSwipeDisabled(true);
          setShowConfirmation(true);

          Animated.timing(height, {
            toValue: Dimensions.get("window").height,
            duration: swipeAnimationDuration,
            useNativeDriver: false,
          }).start(() => {
            handleConfirm();
          });`,
                  why: "The write happens when the animation ends, not when the finger lifts.",
                },
              ],
            },
            {
              n: 4,
              title: "Guards that never fire",
              detail: "The responder is built once, so it sees the first render's values forever.",
              state: "partial",
              under: [
                {
                  kind: "source",
                  file: "app/individual/index/components/rsvpDrawer.tsx",
                  start: 302,
                  code: `  const confirmPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () =>
        !isSwipeDisabled && !isKeyboardVisible,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (isSwipeDisabled || isKeyboardVisible) return false;
        return gestureState.dy < -10;
      },`,
                  why: "useRef(...).current keeps the first PanResponder, whose closures captured isSwipeDisabled and isKeyboardVisible when both were false. The author worked around this for the form fields with refs, but not for the guards. Whether a second swipe is reachable depends on the confirmation overlay covering the handle — not determinable without running it.",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "rv-column",
      title: "RSVP Column",
      sub: "events.rsvp is a JSON string keyed by student id; four places rewrite it whole",
      footprint: { dirs: ["app/individual/index/components/rsvpDrawer.tsx", "app/org/index/attendees.tsx"], files: 4 },
      group: { ordering: "set", note: "The same fact, stored twice." },
      shape: { kind: "figure", id: "rsvp-writers", note: "Each writer reads, edits and saves the whole string; nothing locks it" },
      state: "partial",
      alarm: true,
      col: 0,
      row: 1,
      detail:
        "Two students joining the same event at the same moment both read the old string, each add themselves, and the later write erases the earlier one.",
      evidence: "app/individual/index/components/rsvpDrawer.tsx:145",
      anatomy: [
        {
          kind: "map",
          caption: "where an RSVP is recorded",
          rows: [
            {
              from: "events.rsvp",
              to: "{ studentId: { fullName, email, partySize, dietaryRestrictions } }, as text",
              state: "derived",
              under: [
                {
                  kind: "flow",
                  rows: [
                    {
                      n: 1,
                      title: "Read the string",
                      detail: "Select rsvp for this event.",
                      state: "derived",
                      under: [
                        {
                          kind: "source",
                          file: "app/individual/index/components/rsvpDrawer.tsx",
                          start: 145,
                          code: `        const { data: rsvp, error: rsvpError } = await supabase
          .from("events")
          .select("rsvp")
          .eq("id", event.id)
          .single();`,
                          why: "The start of the race window. Nothing between this read and the write below stops another phone doing the same.",
                        },
                      ],
                    },
                    { n: 2, title: "Add yourself", detail: "Parse, set your key, keep everyone else's as read.", state: "derived" },
                    {
                      n: 3,
                      title: "Write it all back",
                      detail: "The whole string replaces the column.",
                      state: "partial",
                      under: [
                        {
                          kind: "source",
                          file: "app/individual/index/components/rsvpDrawer.tsx",
                          start: 166,
                          code: `        const { data: updateData, error: updateError } = await supabase
          .from("events")
          .update({ rsvp: JSON.stringify(rsvpJson) })
          .eq("id", event.id)
          .single();`,
                          why: "Last write wins. A student — not the organiser — is updating the event row here, so the database must allow students to update events at all.",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              from: "individual.rsvp",
              to: "an array of event ids — the same fact from the student's side",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "app/individual/index/components/rsvpDrawer.tsx",
                  start: 207,
                  code: `      const uniqueSavedEvents = new Set(existingSavedEvents.rsvp);
      uniqueSavedEvents.add(event.id);
      const updatedSavedEvents = Array.from(uniqueSavedEvents);

      const { data: updatedEvent, error: updateError } = await supabase
        .from("individual")
        .update({ rsvp: updatedSavedEvents })
        .eq("id", user.id)`,
                  why: "A second write after the first succeeds, with no transaction. If this one fails the error is only logged, and the two copies disagree. The variable names say \"saved events\"; the column is RSVPs.",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "rv-cancel",
      title: "Cancel",
      sub: "Undoing a join is written four times, and two copies disagree about the data",
      footprint: { dirs: ["app/individual/index/components/joinButton.tsx", "app/individual/index/eventdetails.tsx", "app/individual/saved/index.tsx"], files: 4 },
      group: { ordering: "set", note: "Four copies of one operation." },
      state: "partial",
      alarm: true,
      col: 0,
      row: 2,
      detail:
        "Two copies treat events.rsvp as the object it is. Two treat it as an array of ids — one of them is the Cancel on the Saved tab.",
      evidence: "app/individual/saved/index.tsx:114",
      anatomy: [
        {
          kind: "map",
          caption: "copy → what it assumes",
          rows: [
            {
              from: "joinButton.tsx",
              to: "an object: delete your key — correct",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "app/individual/index/components/joinButton.tsx",
                  start: 42,
                  code: `      // Parse and update RSVP data
      let rsvpData = eventData.rsvp ? JSON.parse(eventData.rsvp) : {};
      delete rsvpData[user.id]; // Remove the user from the RSVP data

      // Update event's RSVP data
      const { error: updateEventError } = await supabase
        .from("events")
        .update({ rsvp: JSON.stringify(rsvpData) })
        .eq("id", event.id);`,
                  why: "The shape the join writes. eventdetails.tsx:238 does the same, in parallel with the individual update.",
                },
              ],
            },
            { from: "eventdetails.tsx", to: "an object — correct, both writes in Promise.all", state: "derived" },
            {
              from: "saved/index.tsx",
              to: "an array: calls .includes on an object, throws, cancels nothing",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "app/individual/saved/index.tsx",
                  start: 124,
                  code: `      let rsvpArray = currEvent.rsvp ? JSON.parse(currEvent.rsvp) : [];
      const userId = user.id;

      if (rsvpArray.includes(userId)) {
        rsvpArray = rsvpArray.filter((id) => id !== userId);
        await supabase
          .from("events")
          .update({ rsvp: JSON.stringify(rsvpArray) })
          .eq("id", event.id);
      }`,
                  why: "JSON.parse of the join's string yields an object, which has no .includes. The TypeError is caught and logged, so the button does nothing visible: the student stays on the attendee list and in their own list.",
                },
              ],
            },
            { from: "rsvpEvents.tsx", to: "the same array assumption, in a component nothing imports", state: "derived" },
          ],
        },
      ],
    },
    {
      id: "rv-state",
      title: "Button State",
      sub: "Join and Save decide what to show from a list that starts empty every launch",
      footprint: { dirs: ["app/individual/index/components/"], files: 3 },
      group: { ordering: "set", note: "Two lists in one context, with the same flaw." },
      state: "partial",
      alarm: true,
      col: 0,
      row: 3,
      detail:
        "EventProvider holds joinedEvents and savedEvents in memory. Nothing loads them from the database, so after a restart every button shows its \"not yet\" face.",
      evidence: "app/individual/index/components/eventContext.tsx:17",
      anatomy: [
        {
          kind: "map",
          caption: "list → what goes wrong",
          rows: [
            {
              from: "joinedEvents",
              to: "starts empty and is only ever toggled",
              state: "derived",
              under: [
                {
                  kind: "map",
                  caption: "the consequence",
                  rows: [
                    {
                      from: "after a restart",
                      to: "an event you joined shows Join; tapping it joins again",
                      state: "derived",
                      under: [
                        {
                          kind: "source",
                          file: "app/individual/index/components/joinButton.tsx",
                          start: 21,
                          code: `  const { joinedEvents, toggleJoined, openRSVPDrawer } = useEventContext();
  const isRSVPd = joinedEvents.includes(event.id);

  const handleJoin = () => {
    openRSVPDrawer(event); // Opens drawer but doesn't update state yet
  };`,
                          why: "Re-joining overwrites your own key in events.rsvp, so it is mostly harmless — but Cancel is unreachable from this button until you join again.",
                        },
                      ],
                    },
                    {
                      from: "where it starts",
                      to: "useState([]) in the provider at the app root",
                      state: "derived",
                      under: [
                        {
                          kind: "source",
                          file: "app/individual/index/components/eventContext.tsx",
                          start: 17,
                          code: `export const EventProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [savedEvents, setSavedEvents] = useState<number[]>([]);
  const [joinedEvents, setJoinedEvents] = useState<number[]>([]);
  const [isRSVPDrawerOpen, setIsRSVPDrawerOpen] = useState(false);
  const [currentEvent, setCurrentEvent] = useState<any | null>(null);

  const toggleSaved = (eventId: number) => {
    setSavedEvents((prev) =>
      prev.includes(eventId)
        ? prev.filter((id) => id !== eventId) // Remove event if already saved
        : [...prev, eventId] // Add event if not saved
    );
  };`,
                          why: "The database already holds both lists (individual.rsvp and individual.saved_events), and the home screen fetches them — into its own local state, not into this context.",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              from: "savedEvents",
              to: "same flaw; Save on a saved event appends a duplicate id",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "app/individual/index/components/saveButton.tsx",
                  start: 74,
                  code: `      let updatedSavedEvents: number[];
      if (isSaved) {
        // Remove event from saved list
        updatedSavedEvents = (data?.saved_events || []).filter(
          (id: number) => id !== eventId
        );
      } else {
        // Add event to saved list
        updatedSavedEvents = [...(data?.saved_events || []), eventId];
      }`,
                  why: "isSaved comes from the empty context, so the button always adds. Unlike the RSVP array this is a plain append, not a Set — the id goes in twice.",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
