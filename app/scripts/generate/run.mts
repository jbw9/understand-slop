// usage (from app/): npx -y tsx --tsconfig tsconfig.json scripts/generate/run.mts <repo dir> [--name x] [--out dir] [--fresh] [--roots a,b] [--stop-after summarize|cut] [--scope path,dir/ --focus "who reads it"]
//   writes maps/<name>/map.json, report.json and audit.md, how the map was reached (or <out>/…); model replies are cached in maps/<name>/.cache/
//   maps/ holds the committed examples; the app's Import writes to its own vault with --out instead.
//   SLOP_CLAUDE names the `claude` binary for SLOP_BACKEND=claude-code (default: `claude` on PATH).
// --update redoes only the sections the code changed since the map last looked (see update.ts); SLOP_UPDATE picks its model.
//   SLOP_CUT / SLOP_AUTHOR = haiku|sonnet|opus pick the model for those stages (default opus).
//   AWS credentials come from app/.env.local when it exists (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
//   AWS_BEARER_TOKEN_BEDROCK, AWS_REGION), otherwise from the machine's default AWS profile.
import { existsSync } from "node:fs";

// Before the Bedrock client is imported, so it is built with these.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const args = process.argv.slice(2);
if (args.includes("--update")) await (await import("./update")).update(args);
else await (await import("./pipeline")).main(args);
