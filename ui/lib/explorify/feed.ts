import type { Node } from "@/lib/data";
/* ═══ 4. EVENT FEED ═══════════════════════════════════════════
   Five levels: the feed → the fetch → its phone cache → what the cache
   holds → the RSVP payload that put it there. */
export const feed: Node = {
  id: "feed",
  title: "Event Feed",
  sub: "A student's home: nearest campus by GPS, that campus's upcoming events, ranked",
  footprint: {
    dirs: ["app/individual/index/", "lib/localStorage.ts"],
    files: 7,
  },
  group: { ordering: "sequence" },
  shape: { kind: "count", value: "61", unit: "campuses to pick the nearest from" },
  state: "derived",
  col: 0,
  row: 3,
  detail:
    "Campus is chosen first, then every published, upcoming event for it is fetched once and cached on the phone. Both home rows and search read that cache.",
  evidence: "app/individual/index/index.tsx:130",
  children: [
    {
      id: "fd-campus",
      title: "Campus Pick",
      sub: "GPS to the nearest of 61 hard-coded universities, or a manual drawer",
      footprint: { dirs: ["app/individual/index/index.tsx", "app/individual/index/components/universityList.tsx"], files: 3 },
      group: { ordering: "sequence" },
      shape: { kind: "marks", ids: ["expo"], note: "expo-location for the fix" },
      state: "derived",
      col: 0,
      row: 0,
      detail:
        "The campus is not saved anywhere: every launch asks for location again. The university list is a TypeScript array, not a table.",
      evidence: "app/individual/index/index.tsx:150",
      anatomy: [
        {
          kind: "flow",
          rows: [
            {
              n: 1,
              title: "Ask permission",
              detail: "Granted → nearest campus. Denied → an alert offering the manual drawer.",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "app/individual/index/index.tsx",
                  start: 130,
                  code: `  const getLocationAndUniversity = async () => {
    if (isLocationManuallySet) return;

    let { status } = await Location.requestForegroundPermissionsAsync();
    setLocationPermission(status);

    if (status === "granted") {
      await getNearestUniversity();
    } else {
      Alert.alert(
        "Location Permission Denied",
        "Please enable location services to see events near you, or manually select your location.",
        [
          { text: "OK", onPress: () => showManualLocationSelector() },
          { text: "Try Again", onPress: () => getLocationAndUniversity() },
        ]
      );
    }
  };`,
                  why: "A manual pick only holds for the session — isLocationManuallySet is component state, so the next launch asks again.",
                },
              ],
            },
            {
              n: 2,
              title: "Nearest campus",
              detail: "Great-circle distance to each of 61 universities; the smallest wins, however far.",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "app/individual/index/index.tsx",
                  start: 150,
                  code: `  const getNearestUniversity = async () => {
    try {
      let location = await Location.getCurrentPositionAsync({});
      const userLat = location.coords.latitude;
      const userLon = location.coords.longitude;

      let nearest = universities[0];
      let minDistance = Number.MAX_VALUE;

      universities.forEach((uni) => {
        const distance = calculateDistance(userLat, userLon, uni.lat, uni.lon);
        if (distance < minDistance) {
          minDistance = distance;
          nearest = uni;
        }
      });

      setNearestUniversity(nearest.abbreviation);
      setCampus(nearest.name);
      refreshEvents(nearest.name);`,
                  why: "The header shows the abbreviation; the query uses the full name. calculateDistance is written out by hand here while the haversine-distance package, already a dependency, is used on the organisation side.",
                },
              ],
            },
            { n: 3, title: "Fetch for it", detail: "refreshEvents(campus name) — see Event Fetch.", state: "derived" },
          ],
        },
      ],
    },
    {
      id: "fd-fetch",
      title: "Event Fetch",
      sub: "One query per campus, past days dropped, the result cached on the phone",
      footprint: { dirs: ["lib/localStorage.ts"], files: 1 },
      group: { ordering: "sequence" },
      state: "partial",
      alarm: true,
      col: 0,
      row: 1,
      detail:
        "fetchAllEvents selects every column of every published event on the campus — including the `rsvp` string, which holds every attendee's name and email.",
      evidence: "lib/localStorage.ts:42",
      anatomy: [
        {
          kind: "flow",
          rows: [
            {
              n: 1,
              title: "Query by campus",
              detail: "published = true and campus equal to the full university name.",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "lib/localStorage.ts",
                  start: 49,
                  code: `    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("published", true)
      .eq("campus", location)
      .order("date", { ascending: true });`,
                  why: "An exact string match. An event saved with no campus, or with an abbreviation, never appears to anyone.",
                },
              ],
            },
            {
              n: 2,
              title: "Drop past days",
              detail: "Filtered on the phone, keeping today and later.",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "lib/localStorage.ts",
                  start: 65,
                  code: `    const now = startOfDay(new Date());
    const filteredEvents = data.filter((event) => {
      const eventDate = parseISO(event.date);
      return isAfter(eventDate, now) || isSameDay(eventDate, now);
    });

    return await storeData("events", filteredEvents);`,
                  why: "Past events are downloaded and then thrown away; the date filter could be in the query.",
                },
              ],
            },
            {
              n: 3,
              title: "Cache it",
              detail: "Stored whole under the key \"events\" — and everything in the row comes with it.",
              state: "partial",
              under: [
                {
                  kind: "map",
                  caption: "what lands on every student's phone",
                  rows: [
                    { from: "the event", to: "name, place, time, food, picture, organiser id", state: "derived" },
                    {
                      from: "rsvp",
                      to: "every attendee's full name, email, party size and dietary needs",
                      state: "partial",
                      under: [
                        {
                          kind: "source",
                          file: "app/individual/index/components/rsvpDrawer.tsx",
                          start: 155,
                          code: `        let rsvpJson = rsvp?.rsvp ? JSON.parse(rsvp?.rsvp) : {};

        rsvpJson[uuid] = {
          fullName: fullNameRef.current,
          email: emailRef.current,
          partySize: partySizeRef.current,
          dietaryRestrictions: dietaryRestrictionsRef.current.filter(
            (item) => item !== "Other"
          ),
        };`,
                          why: "This is what joining writes into the row. Because the feed selects *, any student who opens the app downloads the emails of everyone attending every event on their campus.",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
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
      col: 0,
      row: 2,
      detail:
        "The only ranking in the app. Upcoming, the row below, is simply the first eight by date.",
      evidence: "app/individual/index/components/youmightlike.tsx:48",
      anatomy: [
        {
          kind: "map",
          caption: "rule → points",
          rows: [
            {
              from: "interests",
              to: "up to 5, by the share of your interests the event's categories match",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "app/individual/index/components/youmightlike.tsx",
                  start: 55,
                  code: `      const scoredEvents: EventScore[] = events
        .filter((event) => new Date(event.date) >= now)
        .map((event) => {
          let score = 0;
          const normalizedEventTypes = normalizeInterests(event.type);

          const matchingInterests = normalizedEventTypes.filter((type) => userInterests.includes(type));
          score += (matchingInterests.length / userInterests.length) * 5;`,
                  why: "The heaviest rule: up to 5 of a possible 13. Note the filter above it: a bare date parses as UTC midnight, which on a US phone is already past — so today's events never appear in this row.",
                },
              ],
            },
            {
              from: "soon, popular, evening",
              to: "3/2/1 within 7/14/30 days; 2 for 10+ attendees, 1 for 5+; 1 if it starts 18:00–21:00",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "app/individual/index/components/youmightlike.tsx",
                  start: 64,
                  code: `          const daysUntilEvent = Math.floor((new Date(event.date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysUntilEvent <= 7) score += 3;
          else if (daysUntilEvent <= 14) score += 2;
          else if (daysUntilEvent <= 30) score += 1;

          const attendeeCount = event.rsvp ? Object.keys(JSON.parse(event.rsvp)).length : 0;
          if (attendeeCount >= 10) score += 2;
          else if (attendeeCount >= 5) score += 1;

          if (userLocation && event.location) {
            const sameCity = event.location.terms.some((term) => term.value.toLowerCase().includes(userLocation.city.toLowerCase()));
            if (sameCity) score += 2;
          }

          const eventHour = parseInt(event.time.split(":")[0]);
          if (eventHour >= 18 && eventHour <= 21) score += 1;`,
                  why: "Popularity counts RSVP keys, not heads — a party of four counts once. The same-city rule is the next row.",
                },
              ],
            },
            {
              from: "same city",
              to: "2 points, read from user.location — which nothing in the app writes",
              state: "inferred",
              under: [
                {
                  kind: "facts",
                  rows: [
                    { label: "Reader", value: "youmightlike.tsx reads user.location.city", state: "derived" },
                    { label: "Writers", value: "None: no sign-up, profile edit or launch step sets a location on individual", state: "derived" },
                    { label: "So", value: "The rule is probably dead unless the column is filled outside the app", state: "inferred" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "fd-search",
      title: "Search",
      sub: "Text and category filters over the cached events, one organiser lookup per event",
      footprint: { dirs: ["app/individual/index/search.tsx"], files: 1 },
      state: "derived",
      col: 0,
      row: 3,
      detail:
        "Search never queries events — it filters the phone cache. Only the organiser names are fetched, one request each.",
      evidence: "app/individual/index/search.tsx:48",
      anatomy: [
        {
          kind: "map",
          caption: "what search reads",
          rows: [
            {
              from: "events",
              to: "the cache from Event Fetch, so only this campus, only upcoming",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "app/individual/index/search.tsx",
                  start: 48,
                  code: `  const fetchEvents = async () => {
    try {
      const eventsData = await retrieveData("events");
      const eventsWithOrganizers = await Promise.all(
        eventsData.map(async (event) => {
          const { data: organizationData } = await supabase.from("organizations").select("org_name").eq("id", event.uuid).single();
          return { ...event, organizer_name: organizationData?.org_name };
        })
      );
      setEvents(eventsWithOrganizers);
      setFilteredEvents(eventsWithOrganizers);`,
                  why: "An N+1: fifty cached events means fifty organisation queries every time the search screen gains focus. The organisation side has its own copy, app/org/index/search.tsx.",
                },
              ],
            },
            { from: "categories", to: "the same eight values as sign-up", state: "derived" },
          ],
        },
      ],
    },
  ],
};
