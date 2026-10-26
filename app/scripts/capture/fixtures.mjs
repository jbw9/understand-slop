// Sample data for screenshots. Every name, email and event here is made up.
import fs from "node:fs";
import os from "node:os";

const src = fs.readFileSync(`${os.homedir()}/Desktop/Code/explorify/lib/supabase.ts`, "utf8");
const REF = src.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1]; // used only for the storage key name

const CAMPUS = "University of Illinois Urbana-Champaign";
const STUDENT = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const OTHER_ORG = "33333333-3333-4333-8333-333333333333";
const S2 = "44444444-4444-4444-8444-444444444444";
const S3 = "55555555-5555-4555-8555-555555555555";

const pic = (a, b) =>
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="470" cy="140" r="90" fill="white" fill-opacity="0.12"/><circle cx="120" cy="500" r="150" fill="white" fill-opacity="0.08"/></svg>`,
  ).toString("base64");
const face = (c, initials) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${c}"/><text x="100" y="122" font-family="Helvetica" font-size="72" fill="white" text-anchor="middle">${initials}</text></svg>`);

const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const loc = (place, street) => ({
  description: `${place}, ${street}, Urbana, IL, USA`,
  terms: [{ offset: 0, value: place }, { offset: 0, value: street }, { offset: 0, value: "Urbana" }, { offset: 0, value: "IL" }, { offset: 0, value: "USA" }],
});

const rsvp = {
  [STUDENT]: { fullName: "Maya Chen", email: "maya@illinois.edu", partySize: 2, dietaryRestrictions: ["🥕 Vegan"], checkedIn: true },
  [S2]: { fullName: "Leo Park", email: "leo@illinois.edu", partySize: 1, dietaryRestrictions: ["🕌 Halal", "no shellfish"] },
  [S3]: { fullName: "Priya Nair", email: "priya@illinois.edu", partySize: 3, dietaryRestrictions: [] },
};

const event = (id, name, type, d, time, end, place, street, colors, extra = {}) => ({
  id, uuid: ORG, name,
  description: `${name} — open to every student. Come meet the team, see what we build, and grab some food.`,
  type, campus: CAMPUS, date: day(d), time, end_time: end,
  location: loc(place, street), room_number: "Room 1002",
  thumbnail: pic(colors[0], colors[1]),
  dress_code: "Casual", food: "Yes, pizza and drinks", published: true,
  rsvp: JSON.stringify(rsvp), created_at: new Date().toISOString(), ...extra,
});

const EVENTS = [
  event(101, "Robotics Demo Night", ["stem", "social"], 2, "18:30:00", "20:30:00", "Siebel Center", "201 N Goodwin Ave", ["#1f5c4d", "#3aa17e"]),
  event(102, "Intro to Python Workshop", ["stem", "education & social services"], 4, "17:00:00", "19:00:00", "Grainger Library", "1301 W Springfield Ave", ["#2b3a8c", "#5b7bd5"]),
  event(103, "Lantern Festival", ["cultural", "social"], 6, "19:00:00", "22:00:00", "Main Quad", "1401 W Green St", ["#b4471f", "#f0a33b"]),
  event(104, "Startup Pitch Practice", ["business, law & policy"], 9, "16:00:00", "18:00:00", "Business Instructional Facility", "515 E Gregory Dr", ["#5a2b8c", "#a35bd5"]),
  event(105, "Sunrise Yoga", ["health & wellbeing", "sports & recreation"], 12, "07:00:00", "08:00:00", "ARC", "201 E Peabody Dr", ["#0f6b8a", "#58c3d9"]),
  event(106, "Hackathon Kickoff", ["stem"], 1, "12:00:00", "14:00:00", "Siebel Center", "201 N Goodwin Ave", ["#26323d", "#56708a"], { published: false, rsvp: null }),
  event(107, "Spring Social", ["social"], -10, "18:00:00", "21:00:00", "Illini Union", "1401 W Green St", ["#7a3b2e", "#c47a5a"]),
];

const INDIVIDUAL = {
  id: STUDENT, email: "maya@illinois.edu", full_name: "Maya Chen", interests: ["stem", "social"],
  rsvp: [101], saved_events: [103], avatar_url: null, location: null, major: "Computer Science", campus: CAMPUS,
};
const ORGS = [
  { id: ORG, email: "hello@illinirobotics.org", org_name: "Illini Robotics Club", type: ["stem", "social"], avatar_url: null, bio: "We build robots and teach anyone who wants to learn.", contact_name: "Sam Ortiz", contact_email: "sam@illinirobotics.org", website: "illinirobotics.org", instagram: "@illinirobotics", campus: CAMPUS },
  { id: OTHER_ORG, email: "hi@lanterns.org", org_name: "Asian American Association", type: ["cultural"], avatar_url: null, campus: CAMPUS },
];
const PEOPLE = [
  INDIVIDUAL,
  { id: S2, email: "leo@illinois.edu", full_name: "Leo Park", interests: ["stem"], avatar_url: null },
  { id: S3, email: "priya@illinois.edu", full_name: "Priya Nair", interests: ["cultural"], avatar_url: null },
];
const TABLES = { events: EVENTS, individual: PEOPLE, organizations: ORGS };

const userFor = (role) => ({
  id: role === "org" ? ORG : STUDENT, aud: "authenticated", role: "authenticated",
  email: role === "org" ? ORGS[0].email : INDIVIDUAL.email,
  app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2025-01-01T00:00:00Z",
});

export function session(role) {
  if (role === "none") return null;
  return {
    access_token: "sample.access.token", refresh_token: "sample-refresh", token_type: "bearer",
    expires_in: 3600 * 24 * 365, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    user: userFor(role),
  };
}

/** Runs in the page before the app: the session and the app's own cached keys. */
export function seed(role, data) {
  if (!data) return;
  const ref = "__REF__";
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(data.session));
  localStorage.setItem("uuid", JSON.stringify(data.session.user.id));
  localStorage.setItem("user", JSON.stringify(data.profile));
  localStorage.setItem("events", JSON.stringify(data.events));
}
const seedSrc = seed.toString().replace("__REF__", REF);
export { seedSrc };

/** PostgREST-ish filtering: enough for eq / in / neq / order. */
function query(table, search) {
  let rows = [...(TABLES[table] ?? [])];
  for (const [k, v] of new URLSearchParams(search)) {
    if (["select", "order", "limit", "offset", "columns", "on_conflict"].includes(k)) continue;
    const m = v.match(/^(eq|neq|in|gte|lte|gt|lt|ilike|is)\.(.*)$/);
    if (!m) continue;
    const [, op, raw] = m;
    rows = rows.filter((r) => {
      const x = r[k];
      if (op === "eq") return String(x) === raw;
      if (op === "neq") return String(x) !== raw;
      if (op === "in") return raw.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/"/g, "")).includes(String(x));
      if (op === "gte") return String(x) >= raw;
      if (op === "lte") return String(x) <= raw;
      if (op === "gt") return String(x) > raw;
      if (op === "lt") return String(x) < raw;
      return true;
    });
  }
  const order = new URLSearchParams(search).get("order");
  if (order) {
    const [col, dir] = order.split(".");
    rows.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (dir === "desc" ? -1 : 1));
  }
  return rows;
}

export function respond(role, method, url, body, headers = {}) {
  const u = new URL(url);
  const p = u.pathname;
  const json = (v, status = 200) => ({ status, body: JSON.stringify(v) });
  if (method === "OPTIONS") return { status: 204, body: "" };

  if (p.startsWith("/auth/v1/user")) return role === "none" ? json({ message: "no session" }, 401) : json(userFor(role));
  if (p.startsWith("/auth/v1/token")) return json(session(role === "none" ? "student" : role));
  if (p.startsWith("/auth/v1/signup")) return json({ ...userFor("student"), identities: [{}] });
  if (p.startsWith("/auth/v1/verify")) return json(session("student"));
  if (p.startsWith("/auth/v1/")) return json({});

  if (p.startsWith("/storage/v1/")) return { status: 200, type: "image/svg+xml", body: decodeURIComponent(face("#3aa17e", "MC").split(",")[1]) };
  if (p.startsWith("/functions/v1/")) return json({ ok: true });

  const t = p.match(/^\/rest\/v1\/([a-z_]+)/);
  if (t) {
    if (method !== "GET") {
      // Writes echo back what was sent, as `.select()` after an insert expects.
      let sent = {};
      try { sent = JSON.parse(body ?? "{}"); } catch {}
      return json(Array.isArray(sent) ? sent : [{ id: 999, ...sent }], method === "POST" ? 201 : 200);
    }
    const rows = query(t[1], u.search);
    const single = /vnd\.pgrst\.object/.test(headers.Accept ?? headers.accept ?? "");
    return single ? (rows[0] ? json(rows[0]) : json({ message: "no rows" }, 406)) : json(rows);
  }
  return json({});
}

/** What the page needs before the app starts: session, cached profile, cached feed. */
export function seedData(role) {
  if (role === "none") return null;
  return {
    session: session(role),
    profile: role === "org" ? ORGS[0] : INDIVIDUAL,
    events: EVENTS.filter((e) => e.published && e.campus === CAMPUS),
  };
}
