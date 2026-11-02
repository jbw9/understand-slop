/**
 * `<out>/index.json`: every file of the checkout and what the map knows about
 * it — which roots own it, why it was left out, its top-level symbols. The
 * app finds things by it and measures coverage against it (lib/coverage.ts),
 * so a file the map does not explain is still listed, with the reason, rather
 * than simply absent.
 */
import type { IndexFile, MapIndex } from "@/lib/coverage";
import { excludedBy, owners, type Cut } from "./cut";
import { isSource, type Inventory } from "./inventory";
import type { FileSummary } from "./summarize";

export function catalogOf(inv: Inventory, sums: Record<string, FileSummary>, cut: Cut): MapIndex {
  const files: Record<string, IndexFile> = {};
  for (const f of inv.files) {
    if (f.outside) continue;
    const s = sums[f.path];
    const left = cut.excluded.find((e) => e.path === f.path || (e.path.endsWith("/") && f.path.startsWith(e.path)));
    files[f.path] = {
      roots: owners(cut, f.path),
      status: !isSource(f) ? "other" : excludedBy(cut, f.path) ? "excluded" : "source",
      ...(left ? { reason: left.reason } : {}),
      kind: s?.kind ?? (f.test ? "test" : "other"),
      ...(s?.purpose ? { purpose: s.purpose } : {}),
      lines: f.lines,
      symbols: (s?.symbols ?? []).map(({ name, start, end, does }) => ({ name, start, end, does })),
    };
  }
  return { commit: inv.commit, files };
}
