import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Zilla_Slab } from "next/font/google";
import { LandingAgent } from "@/components/v2/landing-agent";
import { LandingCover } from "@/components/v2/landing-cover";
import { LandingEvolution } from "@/components/v2/landing-evolution";
import { LandingDemo, StarCount, type DemoMap } from "@/components/v2/landing-demo";
import { LandingHow } from "@/components/v2/landing-how";
import { LandingInstall } from "@/components/v2/landing-install";
import { LandingNav } from "@/components/v2/landing-nav";
import { LandingStart } from "@/components/v2/landing-start";
import { LandingVoices, type Voice } from "@/components/v2/landing-voices";
import s from "@/components/v2/v2.module.css";
import { loadMap } from "@/lib/maps";

export const metadata: Metadata = {
  title: "Bluprint",
  description: "A visual way to explore a codebase: start broad, go deeper, down to the line.",
};

// A light slab for the lettering, Plex Mono for the labels on the sheet, Plex Sans for reading.
const display = Zilla_Slab({ variable: "--font-display", subsets: ["latin"], weight: ["300", "400", "500"], display: "swap" });
const sans = IBM_Plex_Sans({ variable: "--font-body", subsets: ["latin"], display: "swap" });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

const REPO = "jbw9/bluprint";
const GITHUB = `https://github.com/${REPO}`;

// This repo first: the demo opens on the project explaining itself.
const DEMOS = [
  { id: "bluprint", label: "Bluprint itself" },
  { id: "flask", label: "Flask" },
  { id: "fastapi", label: "FastAPI" },
  { id: "ky", label: "ky" },
  { id: "umami", label: "Umami" },
  { id: "kafka", label: "Kafka control plane" },
];

// The same problem at every size. John Doe is the page's own voice; the other two are people the team spoke with, by role.
const VOICES: Voice[] = [
  {
    quote: "Code review is the new bottleneck. Some engineers have ten waiting.",
    by: "Software Development Manager, Amazon",
  },
  { quote: "The agents ship more in a week than the team can review.", by: "CTO, Series B tech startup" },
  { quote: "You built it in a weekend. I bet you can’t explain how it works.", by: "John Doe, solo developer" },
];

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
  const maps: DemoMap[] = DEMOS.map(({ id, label }) => {
    const file = loadMap(id);
    return { id, label, files: file.RUN.files ?? 0, commit: file.RUN.commit ?? "" };
  });

  const flask = loadMap("flask");
  const first = flask.AUTHORED[0];
  const config = first.children!.find((c) => c.id === "ca-config")!;

  const ctas = (
    <>
      <LandingInstall />
      <a className={`${s.btn} ${s.ghost}`} href={GITHUB}>
        <svg viewBox="0 0 16 16" aria-hidden className={s.gh}>
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        View on GitHub
        <StarCount repo={REPO} />
      </a>
    </>
  );

  return (
    // The layout locks the body, as the app's does for its canvas; this page scrolls itself.
    <div className={`${s.page} ${display.variable} ${sans.variable} ${mono.variable}`}>
      <div className={s.paper}>
      <LandingNav github={GITHUB} />
      <main>
        <LandingCover />
        <LandingEvolution />
        <div className={s.top}>
          <div className={s.wrap}>
            <header id="app" className={s.appHead}>
              {/* Uncle Sam from the 1917 poster, cut out in the cover's blue like its hand, pointing out at the reader from behind the line. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- the site is a static export, which next/image cannot optimize. */}
              <img className={s.you} src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/v2/uncle-sam-cutout.png`} alt="" />
              <h2>And now there&rsquo;s you.</h2>
            </header>
            <section aria-label="Live demo" className={s.demo}>
              <LandingDemo maps={maps} />
            </section>
          </div>
        </div>

        <div className={s.wrap}>
          <LandingVoices voices={VOICES} />
          <LandingHow
            name="flask"
            roots={flask.OVERVIEW.anatomy.find((a) => a.kind === "diagram")!}
            opened={{
              id: first.id,
              title: first.title,
              sub: sentence(first.sub ?? ""),
              diagram: first.anatomy!.find((a) => a.kind === "diagram")!,
            }}
            cited={{
              title: config.title,
              sub: sentence(config.sub ?? ""),
              file: "flask/sansio/app.py · make_config",
              start: 489,
              lines: MAKE_CONFIG,
            }}
          />
        </div>
        <LandingAgent name="flask" diagram={flask.OVERVIEW.anatomy.find((a) => a.kind === "diagram")!} changed="handling-requests" />
        <div className={s.wrap}>
          <LandingStart />
          <section className={`${s.close} ${s.reveal}`} aria-labelledby="close-title">
            <h2 id="close-title">
              Start broad. <em>End at the line.</em>
            </h2>
            <div className={s.ctas}>{ctas}</div>
          </section>
        </div>
      </main>

      <footer className={s.wrap}>
        {/* The drawing's title block. */}
        <dl className={s.end}>
          <div className={s.endTitle}>
            <dt>Title</dt>
            <dd>Bluprint</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              <a href={GITHUB}>{REPO}</a>
            </dd>
          </div>
          <div>
            <dt>Site</dt>
            <dd>blpr.dev</dd>
          </div>
          <div>
            <dt>Scale</dt>
            <dd>Repo to line</dd>
          </div>
          <div>
            <dt>Sheet</dt>
            <dd>1 of 1</dd>
          </div>
        </dl>
      </footer>
      </div>
      <p className={s.credits}>
        Pictures, all public domain, from Wikimedia Commons: Ada Lovelace by Alfred Edward Chalon; Alan Turing, 1951;
        ENIAC, U.S. Army; Grace Hopper, U.S. Navy; Margaret Hamilton with the Apollo flight software, Draper Laboratory;
        Apollo core rope memory; Robert Hooke&rsquo;s microscope, from <i>Micrographia</i>, 1665; James Montgomery Flagg&rsquo;s <i>I Want You</i>, 1917; Michelangelo&rsquo;s{" "}
        <i>The Creation of Adam</i>.
      </p>
    </div>
  );
}
