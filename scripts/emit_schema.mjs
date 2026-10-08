// Write the JSON Schemas for ui/lib/schema.ts into ui/public/maps/:
//   story.schema.json — what the /slop-map skill writes (`slop schema` prints it)
//   map.schema.json   — a story merged with its index (the bundled demos)
// Re-run after changing the schema:
//
//     node scripts/emit_schema.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ui = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "ui");
const require = createRequire(path.join(ui, "package.json"));
const jiti = require("jiti")(import.meta.url, { alias: { "@": ui } });
const { z } = require("zod");
const { MapFile, Story } = jiti(path.join(ui, "lib", "schema.ts"));

for (const [type, title, file] of [
  [Story, "understand-slop story (.slop/story.json)", "story.schema.json"],
  [MapFile, "understand-slop map file", "map.schema.json"],
]) {
  // `io: "input"`: describe what a file may contain (defaults optional), not
  // what the loader produces after filling them in.
  const schema = z.toJSONSchema(type, { io: "input" });
  schema.title = title;
  const out = path.join(ui, "public", "maps", file);
  writeFileSync(out, JSON.stringify(schema, null, 2) + "\n");
  console.log("wrote", path.relative(process.cwd(), out));
}
