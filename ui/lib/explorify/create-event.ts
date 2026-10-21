import type { Node } from "@/lib/data";
/* ═══ 3. CREATE EVENT ═════════════════════════════════════════
   Five levels: creating → the draft row → its date → an evening in
   Illinois → the source. */
export const createEvent: Node = {
  id: "create-event",
  title: "Create Event",
  sub: "An organisation fills a form, gets a draft, previews it, then publishes",
  footprint: {
    dirs: ["app/org/index/addEvent.tsx", "app/org/index/previewEvent.tsx", "app/org/index/editEvent/", "app/org/index/components/"],
    files: 9,
  },
  group: { ordering: "sequence" },
  shape: { kind: "figure", id: "event-states", note: "Draft and Published are one boolean; Archive is only a date comparison" },
  state: "partial",
  alarm: true,
  col: 0,
  row: 2,
  detail:
    "Preview is not a dry run: pressing it inserts the event as a draft row. Publishing flips one boolean. The date written on that row is in UTC while the time is local, so evening events land on the wrong day.",
  evidence: "app/org/index/addEvent.tsx:193",
  children: [
    {
      id: "ce-form",
      title: "Event Form",
      sub: "Name, description, categories, date, time, place, food, picture — and a campus",
      footprint: { dirs: ["app/org/index/addEvent.tsx", "app/org/index/editEvent/"], files: 4 },
      group: { ordering: "set", note: "Fields, each with its own rule." },
      shape: { kind: "marks", ids: ["googlemaps", "supabase"], note: "Places autocomplete for the address; a Supabase bucket for the picture" },
      state: "partial",
      col: 0,
      row: 0,
      detail:
        "Eight fields are required. Campus is not — yet campus is the only field the student feed filters by.",
      evidence: "app/org/index/addEvent.tsx:177",
      anatomy: [
        {
          kind: "map",
          caption: "field → its rule",
          rows: [
            {
              from: "required",
              to: "name, description, a category, date, end time, location, food, picture",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "app/org/index/addEvent.tsx",
                  start: 177,
                  code: `  const checkRequiredFields = () => {
    if (
      !name ||
      !description ||
      selectedCategories.length === 0 ||
      !date ||
      !endTime ||
      !location ||
      !food ||
      !thumbnail
    ) {
      return false;
    }
    return true;
  };`,
                  why: "Food is required, campus is not. An event saved with an empty campus is invisible to every student, with no error anywhere.",
                },
              ],
            },
            {
              from: "campus",
              to: "meant to be guessed from the address; the guess can never run",
              state: "partial",
              under: [
                {
                  kind: "flow",
                  rows: [
                    { n: 1, title: "Pick an address", detail: "Google Places autocomplete, with its key hard-coded at addEvent.tsx:415.", state: "derived" },
                    {
                      n: 2,
                      title: "Look up coordinates",
                      detail: "A second request for the place's geometry — sent with the literal key YOUR_API_KEY.",
                      state: "derived",
                      under: [
                        {
                          kind: "source",
                          file: "app/org/index/addEvent.tsx",
                          start: 394,
                          code: `                  axios
                    .get(
                      \`https://maps.googleapis.com/maps/api/place/details/json?place_id=\${data.place_id}&fields=geometry&key=YOUR_API_KEY\`
                    )
                    .then((response) => {
                      if (
                        response.data.result &&
                        response.data.result.geometry &&
                        response.data.result.geometry.location
                      ) {
                        const { lat, lng } =
                          response.data.result.geometry.location;
                        const nearestCampus = findNearestCampus(lat, lng);
                        setCampus(nearestCampus ? nearestCampus.name : "");
                      }`,
                          why: "A placeholder key gets no geometry back, so the if never passes and campus stays empty. The component already has fetchDetails on, so `details` held the coordinates all along. The same block is copied into editEvent/[id].tsx.",
                        },
                      ],
                    },
                    { n: 3, title: "Pick by hand", detail: "The campus drawer is the only way campus is ever set — if the organiser notices it is empty.", state: "derived" },
                  ],
                },
              ],
            },
            {
              from: "picture",
              to: "uploaded twice — once to the avatar bucket when picked, again on preview",
              state: "derived",
              under: [
                {
                  kind: "map",
                  caption: "the two uploads",
                  rows: [
                    {
                      from: "on pick",
                      to: "the image component uploads to user_avatar and never uses the result",
                      state: "derived",
                      under: [
                        {
                          kind: "source",
                          file: "app/org/index/editEvent/imageupload.tsx",
                          start: 39,
                          code: `          // Get file extension
          const fileExt = image.uri?.split(".").pop()?.toLowerCase() ?? "jpeg";
          const path = \`\${Date.now()}.\${fileExt}\`;

          // Upload to Supabase
          const { data, error: uploadError } = await supabase.storage
            .from("user_avatar")
            .upload(path, arraybuffer, {
              contentType: image.mimeType ?? "image/jpeg",
            });`,
                          why: "Every event picture leaves an orphan file in the avatar bucket. The upload's path is discarded; only the local URI is passed up.",
                        },
                      ],
                    },
                    {
                      from: "on preview",
                      to: "the form uploads again to event_thumbnail and stores its public URL",
                      state: "derived",
                      under: [
                        {
                          kind: "source",
                          file: "app/org/index/addEvent.tsx",
                          start: 148,
                          code: `      const fileExt =
        selectedImage.uri?.split(".").pop()?.toLowerCase() ?? "jpeg";
      const path = \`\${Date.now()}.\${fileExt}\`;

      const { data, error: uploadError } = await supabase.storage
        .from("event_thumbnail")
        .upload(path, arrayBuffer, {
          contentType: selectedImage.mimeType ?? "image/jpeg",
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }

      const { data: publicUrlData } = await supabase.storage
        .from("event_thumbnail")
        .getPublicUrl(path);

      return publicUrlData?.publicUrl;`,
                          why: "This is the copy events.thumbnail points at. A public URL means the bucket is public — anyone with the link can fetch it.",
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
      id: "ce-draft",
      title: "Draft Row",
      sub: "Preview inserts the event with published = false",
      footprint: { dirs: ["app/org/index/addEvent.tsx", "app/org/index/editEvent/[id].tsx"], files: 2 },
      group: { ordering: "set", note: "The columns of one insert." },
      state: "partial",
      alarm: true,
      col: 0,
      row: 1,
      detail:
        "The row belongs to the organisation through `uuid`, its user id. Date and time are written as two text columns, cut from one JavaScript Date in two different time zones.",
      evidence: "app/org/index/addEvent.tsx:222",
      anatomy: [
        {
          kind: "map",
          caption: "column ← where it comes from",
          rows: [
            { from: "uuid", to: "the organisation's auth id — the owner of the event", state: "derived" },
            { from: "location", to: "an object: the Places description and its terms", state: "derived" },
            {
              from: "date",
              to: "the UTC calendar day — while time is local",
              state: "derived",
              under: [
                {
                  kind: "map",
                  caption: "an 8 pm event, on a phone in Illinois (UTC−5 in autumn)",
                  rows: [
                    {
                      from: "on create",
                      to: "stored as tomorrow's date at 20:00",
                      state: "derived",
                      under: [
                        {
                          kind: "source",
                          file: "app/org/index/addEvent.tsx",
                          start: 222,
                          code: `      const previewEventData = {
        uuid: user.id,
        name,
        location,
        room_number: roomNumber,
        description,
        type: selectedCategories,
        thumbnail: thumbnailUrl,
        dress_code: attire,
        food,
        campus: campus,
        date: date ? date.toISOString().split("T")[0] : null,
        time: date ? date.toTimeString().split(" ")[0] : null,
        end_time: endTime ? endTime.toTimeString().split(" ")[0] : null,
        published: false,
      };

      const { data, error } = await supabase
        .from("events")
        .insert(previewEventData)
        .select();`,
                          why: "toISOString is UTC; toTimeString is local. 20:00 in Illinois is 01:00 UTC the next day, so `date` gets tomorrow and `time` gets 20:00. Any event at 19:00 or later (18:00 in winter) is listed a day late.",
                        },
                      ],
                    },
                    {
                      from: "on every edit",
                      to: "read back as local, saved as UTC — a day later again",
                      state: "derived",
                      under: [
                        {
                          kind: "source",
                          file: "app/org/index/editEvent/[id].tsx",
                          start: 218,
                          code: `    try {
      const eventDate = date.toISOString().split("T")[0];
      const eventTime = date.toTimeString().split(" ")[0];
      const eventEndTime = endTime
        ? endTime.toTimeString().split(" ")[0]
        : null;`,
                          why: "The edit screen rebuilds the Date from `${date}T${time}` as local time, then saves it with the same split. Each save of an evening event moves it one more day forward.",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            { from: "published", to: "false — the row is the draft", state: "derived" },
          ],
        },
      ],
    },
    {
      id: "ce-publish",
      title: "Publish",
      sub: "The preview screen flips published to true",
      footprint: { dirs: ["app/org/index/previewEvent.tsx"], files: 1 },
      group: { ordering: "sequence" },
      state: "derived",
      col: 0,
      row: 2,
      detail:
        "Because the draft already exists, \"back\" does not discard anything — it just says so. Publish is a single update.",
      evidence: "app/org/index/previewEvent.tsx:103",
      anatomy: [
        {
          kind: "flow",
          rows: [
            {
              n: 1,
              title: "Back saves a draft",
              detail: "Nothing is written; the row was inserted by Preview. The alert only reports it.",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "app/org/index/previewEvent.tsx",
                  start: 69,
                  code: `  const handleBackPress = () => {
    Alert.alert("Draft Saved!", "Find drafts in the draft section.", [
      { text: "OK" },
    ]);
    navigation.navigate("index" as never);
  };`,
                  why: "Correct, but only because of the insert three screens earlier. Pressing Preview five times makes five drafts.",
                },
              ],
            },
            { n: 2, title: "Edit", detail: "Opens editEvent/[id], which saves and returns to this preview.", state: "derived" },
            {
              n: 3,
              title: "Publish",
              detail: "One update, scoped by event id alone.",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "app/org/index/previewEvent.tsx",
                  start: 103,
                  code: `  const handlePublish = async () => {
    try {
      const { error } = await supabase
        .from("events")
        .update({ published: true })
        .eq("id", eventData.id);

      if (error) throw error;`,
                  why: "No check that the caller owns the event; only row-level security could enforce that, and the policies are not in this repo.",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "ce-tabs",
      title: "Dashboard Tabs",
      sub: "Ongoing, Draft and Archive — three queries over the same rows",
      footprint: { dirs: ["app/org/index/components/"], files: 3 },
      group: { ordering: "set", note: "Three filters; an event is in exactly one." },
      state: "partial",
      col: 0,
      row: 3,
      detail:
        "Archive is not a state anyone writes. It is published events whose date is before today, filtered on the phone.",
      evidence: "app/org/index/components/archive.tsx:46",
      anatomy: [
        {
          kind: "map",
          caption: "tab → what selects it",
          rows: [
            { from: "Ongoing", to: "published, dated today or later", state: "derived" },
            { from: "Draft", to: "not published, any date", state: "derived" },
            {
              from: "Archive",
              to: "published, dated before today — a filter, not a status",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "app/org/index/components/archive.tsx",
                  start: 46,
                  code: `      const { data, error } = await supabase.from("events").select("*").eq("uuid", userUuid).eq("published", true).order("date", { ascending: true });

      if (error) {
        console.error("Error fetching events:", error);
      } else {
        const now = startOfDay(new Date());
        const filteredEvents = (data as Event[]).filter((event) => {
          const eventDate = parseISO(event.date);
          return isBefore(eventDate, now);
        });
        setEvents(filteredEvents);`,
                  why: "The same query as Ongoing with the comparison flipped. The archive-event edge function looks like it should do this; it is an untouched template.",
                },
              ],
            },
            {
              from: "the trash icon",
              to: "deletes the row on one tap, no confirmation",
              state: "derived",
              under: [
                {
                  kind: "source",
                  file: "app/org/index/components/ongoing.tsx",
                  start: 69,
                  code: `  const handleDeleteEvent = async (id: number) => {
    try {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) {
        console.error("Error deleting event:", error);
      } else {
        fetchEvents();
      }
    } catch (error) {
      console.error("Error deleting event:", error);
    }
  };`,
                  why: "A hard delete, and the RSVPs live inside the row — so every attendee's record goes with it, while their own `individual.rsvp` arrays keep the dead id.",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
