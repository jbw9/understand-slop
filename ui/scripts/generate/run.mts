// usage (from ui/): npx -y tsx --tsconfig tsconfig.json scripts/generate/run.mts <repo dir> [--name x] [--fresh] [--roots a,b] [--stop-after summarize|cut] [--scope path,dir/ --focus "who reads it"]
//   writes maps/<name>/map.json and maps/<name>/report.json; model replies are cached in maps/<name>/.cache/
//   SLOP_CUT / SLOP_AUTHOR = haiku|sonnet|opus pick the model for those stages (default opus).
//   AWS credentials come from ui/.env.local when it exists (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
//   AWS_BEARER_TOKEN_BEDROCK, AWS_REGION), otherwise from the machine's default AWS profile.
import { existsSync } from "node:fs";

// Before the Bedrock client is imported, so it is built with these.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { main } = await import("./pipeline");
await main(process.argv.slice(2));
