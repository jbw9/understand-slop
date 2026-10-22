// usage (from ui/): npx -y tsx --tsconfig tsconfig.json scripts/generate/run.mts <repo dir> [--name x] [--fresh] [--roots a,b] [--stop-after summarize|cut]
//   writes maps/<name>/map.json and maps/<name>/report.json; model replies are cached in maps/<name>/.cache/
//   SLOP_CUT / SLOP_AUTHOR = haiku|sonnet|opus pick the model for those stages (default opus).
import { main } from "./pipeline";

await main(process.argv.slice(2));
