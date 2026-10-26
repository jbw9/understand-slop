import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { LandingAgent } from "@/components/landing-agent";
import { LandingDemo, StarCount, type DemoMap } from "@/components/landing-demo";
import { LandingHow } from "@/components/landing-how";
import { LandingStart } from "@/components/landing-start";
import { LandingStruck, type Struck } from "@/components/landing-struck";
import { LandingVoices, type Voice } from "@/components/landing-voices";
import s from "@/components/landing.module.css";
import type { Node } from "@/lib/data";
import { loadMap } from "@/lib/maps";

export const metadata: Metadata = {
  title: "TBD",
  description: "A visual way to explore a codebase: start broad, go deeper, down to the line.",
};

const REPO = "jbw9/understand-slop";
const GITHUB = `https://github.com/${REPO}`;

// This repo first: the demo opens on the project explaining itself.
const DEMOS = [
  { id: "understand-slop", label: "TBD itself" },
  { id: "flask", label: "Flask" },
  { id: "fastapi", label: "FastAPI" },
  { id: "ky", label: "ky" },
  { id: "umami", label: "Umami" },
];

// Placeholders, not real people. Replace with real, attributable quotes before publishing.
const VOICES: Voice[] = [
  {
    who: "A. R.",
    role: "SDE at Meta",
    quote: "I opened a 1,600‑file repo I had never seen and knew how a request moved through it in ten minutes.",
  },
  {
    who: "M. K.",
    role: "Founder, Series B startup",
    quote: "Our agents ship more code in a week than we can review. This is how I check the architecture before it reaches main.",
  },
  {
    who: "J. L.",
    role: "Staff engineer",
    quote: "The removed claims are the part I trust. When the map doesn't know something, it says so.",
  },
];

// One sentence the checker removed from each map, found by its text in that map's report.
const STRUCK = [
  { id: "umami", has: "bounce rate can exceed 100%" },
  { id: "fastapi", has: "Go Back button" },
  { id: "understand-slop", has: "Alarm dashed red" },
  { id: "flask", has: "wires up the Jinja" },
  { id: "ky", has: "Hooks can lower" },
];

interface Report {
  roots: {
    verify?: { nodes: number; rewritten: { id: string; claims: string[] }[] };
  }[];
}

const reportOf = (id: string): Report =>
  JSON.parse(readFileSync(join(process.cwd(), "maps", id, "report.json"), "utf8"));

function* walk(nodes: Node[]): Generator<Node> {
  for (const n of nodes) {
    yield n;
    if (n.children) yield* walk(n.children);
  }
}

// The lines flask's make_config part cites, from src/flask/sansio/app.py.
const MAKE_CONFIG = [
  "root_path = self.root_path",
  "if instance_relative:",
  "    root_path = self.instance_path",
  "defaults = dict(self.default_config)",
  'defaults["DEBUG"] = get_debug_flag()',
  "return self.config_class(root_path, defaults)",
];

/** A map's subtitle up to its first aside, as one sentence. */
const sentence = (sub: string) => `${sub.split(" — ")[0].replace(/\.$/, "")}.`;

export default function Landing() {
  const loaded = DEMOS.map((d) => ({
    ...d,
    file: loadMap(d.id).file,
    report: reportOf(d.id),
  }));
  const maps: DemoMap[] = loaded.map(({ id, label, file }) => ({
    id,
    label,
    files: file.RUN.files ?? 0,
    commit: file.RUN.commit ?? "",
  }));

  const rewritten = loaded.flatMap((d) => d.report.roots.flatMap((r) => r.verify?.rewritten ?? []));
  const struck: Struck[] = STRUCK.map(({ id, has }) => {
    const d = loaded.find((x) => x.id === id)!;
    const hit = d.report.roots
      .flatMap((r) => r.verify?.rewritten ?? [])
      .flatMap((r) => r.claims.map((c) => ({ node: r.id, c })))
      .find((x) => x.c.includes(has))!;
    // "<claim> — <verdict>: <reason>"
    const [, claim, verdict, why] = hit.c.match(/^(.*) — (contradicted|not_shown): (.*)$/)!;
    const where = [...walk(d.file.AUTHORED)].find((n) => n.id === hit.node)!.title;
    return { repo: id, where, claim, verdict: verdict === "contradicted" ? "contradicted" : "not shown", why };
  });

  const flask = loadMap("flask").file;
  const first = flask.AUTHORED[0];
  const config = first.children!.find((c) => c.id === "ca-config")!;

  return (
    // The root layout locks the body for the canvas; this page scrolls itself.
    <div className={s.page}>
      <main>
        <div className={s.top}>
          <div className={s.wrap}>
            <header className={s.nav}>
              <a className={s.mark} href="#">
                TBD
              </a>
              <nav aria-label="Sections">
                <a href="#how">How it works</a>
                <a href="#checks">What it checks</a>
                <a href="#start">Your repo</a>
                <a href="#questions">Questions</a>
                <a href={GITHUB}>GitHub</a>
              </nav>
            </header>
            <section className={s.hero}>
              <h1 className={s.rise}>
                Understand the code <em>you didn&rsquo;t write.</em>
              </h1>
              <div className={s.pitch}>
                <p className={s.rise} style={{ "--i": 1 } as React.CSSProperties}>
                  TBD splits a repository into the steps the program takes. Click a step to open its parts, and keep
                  going until you reach the code.
                </p>
                <div className={`${s.ctas} ${s.rise}`} style={{ "--i": 2 } as React.CSSProperties}>
                  {/* No build to link yet. */}
                  <a className={`${s.btn} ${s.primary}`} href="#">
                    Download for macOS
                  </a>
                  <a className={`${s.btn} ${s.ghost}`} href={GITHUB}>
                    <svg viewBox="0 0 16 16" aria-hidden className={s.gh}>
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                    </svg>
                    View on GitHub
                    <StarCount repo={REPO} />
                  </a>
                </div>
              </div>
            </section>
            <section aria-label="Live demo">
              <LandingDemo maps={maps} />
            </section>
          </div>
        </div>

        <div className={s.wrap}>
          <LandingVoices voices={VOICES} />
          <LandingHow
            name="flask"
            steps={flask.AUTHORED.map((r) => r.title)}
            opened={{
              title: first.title,
              sub: sentence(first.sub ?? ""),
              parts: first.children!.map((c) => c.title),
            }}
            cited={{
              title: config.title,
              sub: sentence(config.sub ?? ""),
              file: "flask/sansio/app.py · make_config",
              start: 489,
              lines: MAKE_CONFIG,
            }}
          />
          <LandingStruck
            items={struck}
            checked={loaded.reduce((n, d) => n + d.report.roots.reduce((m, r) => m + (r.verify?.nodes ?? 0), 0), 0)}
            removed={rewritten.reduce((n, r) => n + r.claims.length, 0)}
          />
          <LandingAgent
            name="flask"
            sections={flask.AUTHORED.map((r) => r.title)}
            changed={flask.AUTHORED.find((r) => r.id === "handling-requests")!.title}
          />
          <LandingStart github={GITHUB} />
        </div>
      </main>

      <footer className={s.wrap}>
        <div className={s.end}>
          <b>TBD</b>
          <a href={GITHUB}>{REPO}</a>
        </div>
      </footer>
    </div>
  );
}
