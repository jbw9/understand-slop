import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LandingDemo, StarCount, type DemoMap } from "@/components/landing-demo";
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

const PROBLEMS = [
  {
    title: "Written faster than it's read",
    body: "Code gets written faster than anyone can read it. The mistakes that matter are architectural, and they surface months later.",
  },
  {
    title: "Asking loses the big picture",
    body: "Asking an assistant “how does this work?” answers one question at a time, and the shape of the whole system never comes into view.",
  },
  {
    title: "Explore instead",
    body: "Start broad, pinpoint a part, go deeper and deeper, down to the line, and always be able to trace your way back.",
  },
];

interface Report {
  elapsed: Record<"summarize" | "cut" | "author" | "verify", number>;
  verifyPassRate: number;
  roots: { title: string; verify: { rewritten: { claims: string[] }[] } }[];
}

export default function Landing() {
  const maps: DemoMap[] = DEMOS.map((d) => {
    const { RUN } = loadMap(d.id).file;
    return { ...d, files: RUN.files ?? 0, elapsed: RUN.elapsed ?? "" };
  });

  const flask = loadMap("flask").file;
  const report: Report = JSON.parse(readFileSync(join(process.cwd(), "maps/flask/report.json"), "utf8"));
  // A claim the verifier caught: the text before " — " is what the author wrote.
  const caught = report.roots[0].verify.rewritten[0].claims[1].split(" — ")[0];

  return (
    // The root layout locks the body for the canvas; this page scrolls itself.
    <div className="h-full overflow-y-auto bg-warm-cream text-ink">
      <header className="sticky top-0 z-10 bg-warm-cream/85 backdrop-blur-sm">
        <nav className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-4">
          <span className="text-[15px] font-semibold tracking-[-0.01em]">TBD</span>
          <div className="flex items-center gap-2">
            <GithubButton compact />
            <DownloadButton compact />
          </div>
        </nav>
      </header>

      <main>
        <section className="relative">
          {/* The canvas's own ground, fading out so the headline sits on paper. */}
          <div
            aria-hidden
            className="dotfield absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
          />
          <div className="relative mx-auto max-w-[1180px] px-6 pb-14 pt-20 text-center sm:pt-28">
            <p className="mb-5 font-mono text-[10.5px] uppercase tracking-[0.09em] text-faint">Open source · macOS</p>
            <h1 className="mx-auto max-w-[760px] text-[40px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[56px]">
              Understand the code you didn&rsquo;t write.
            </h1>
            <p className="mx-auto mt-6 max-w-[580px] text-[16.5px] leading-[1.6] text-on-surface-variant">
              Code gets written faster than anyone can read it. TBD maps a repository into the steps it actually
              takes, so you can start broad and go deeper, down to the line.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <DownloadButton />
              <GithubButton />
            </div>
          </div>
        </section>

        <section aria-label="Live demo" className="mx-auto max-w-[1180px] px-6">
          <LandingDemo maps={maps} />
        </section>

        <Section eyebrow="The problem" title="Nobody reads the code anymore.">
          <div className="grid gap-px overflow-hidden rounded-[20px] border bg-border-gray sm:grid-cols-3">
            {PROBLEMS.map((p) => (
              <div key={p.title} className="bg-pure-white p-7">
                <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{p.title}</h3>
                <p className="mt-2 text-[14px] leading-[1.6] text-on-surface-variant">{p.body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="How it works" title="From the whole repo to a single line.">
          <div className="grid gap-5 md:grid-cols-3">
            <Step
              n={1}
              title="Mapped from the code"
              body="A pipeline reads every file and cuts the repo by what it does, not by its folders."
            >
              <ul className="space-y-2.5">
                {(["summarize", "cut", "author", "verify"] as const).map((s) => (
                  <li key={s} className="flex items-center justify-between font-mono text-[12px]">
                    <span className="text-on-surface-variant">{s}</span>
                    <span className="text-faint tnum">{report.elapsed[s]}s</span>
                  </li>
                ))}
                <li className="flex items-center justify-between border-t pt-2.5 font-mono text-[12px]">
                  <span className="text-ink">flask</span>
                  <span className="text-faint tnum">{flask.RUN.files} files</span>
                </li>
              </ul>
            </Step>
            <Step n={2} title="One level at a time" body="Each level answers one question. Open a step and only its parts appear.">
              <ol className="space-y-2">
                {flask.AUTHORED.slice(0, 3).map((r, i) => (
                  <li key={r.id} className="flex items-center gap-2.5">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full border border-mint-line bg-mint-success font-mono text-[10px] text-deep-green">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate rounded-[8px] border bg-pure-white px-2.5 py-1.5 text-[12.5px] font-semibold">
                      {r.title}
                    </span>
                  </li>
                ))}
              </ol>
            </Step>
            <Step n={3} title="Down to the line" body="Every part ends in the real code it describes, cited by file and line.">
              <div className="overflow-hidden rounded-[10px] border bg-code">
                <div className="border-b px-3 py-1.5 font-mono text-[10.5px] text-faint">src/flask/app.py:1566</div>
                <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[11px] leading-[1.7] text-code-plain">
                  <span className="text-code-keyword">def</span> <span className="text-code-call">wsgi_app</span>
                  <span className="text-code-punct">(</span>self, environ, start_response<span className="text-code-punct">):</span>
                  {"\n    "}ctx <span className="text-code-punct">=</span> self.<span className="text-code-call">request_context</span>
                  <span className="text-code-punct">(</span>environ<span className="text-code-punct">)</span>
                  {"\n    "}error <span className="text-code-punct">=</span> <span className="text-code-keyword">None</span>
                  {"\n    "}<span className="text-code-keyword">try</span><span className="text-code-punct">:</span>
                  {"\n        "}ctx.<span className="text-code-call">push</span><span className="text-code-punct">()</span>
                </pre>
              </div>
            </Step>
          </div>
        </Section>

        <Section eyebrow="Checked, not guessed" title="Every claim is held to the code it cites.">
          <div className="grid items-center gap-10 md:grid-cols-[1fr_1.15fr]">
            <div className="space-y-4 text-[15px] leading-[1.65] text-on-surface-variant">
              <p>
                A map is only useful if you can trust it. After a map is written, a second model reads each section
                against the lines it points at. Anything the code doesn&rsquo;t show is rewritten or flagged before you
                ever see it.
              </p>
              <p className="font-mono text-[12.5px] text-muted-slate">
                <span className="text-[28px] font-semibold tracking-[-0.02em] text-ink tnum">{report.verifyPassRate}%</span>{" "}
                of flask&rsquo;s sections verified
              </p>
            </div>
            <div className="rounded-[14px] border bg-pure-white p-5">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.09em] text-faint">{report.roots[0].title}</p>
              <div className="mt-3 flex items-start justify-between gap-4">
                <p className="text-[14px] leading-[1.6] text-muted-slate line-through decoration-clay-line">{caught}</p>
                <span className="shrink-0 rounded-[6px] border border-amber-line bg-amber-surface px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-amber-ink">
                  not shown
                </span>
              </div>
              <p className="mt-4 border-t pt-4 text-[12.5px] leading-[1.6] text-on-surface-variant">
                The cited lines never set up Jinja, so the claim was taken out.
              </p>
            </div>
          </div>
        </Section>

        <Section eyebrow="Beside your agent" title="Keeps up with the code your agent writes.">
          <div className="grid gap-5 md:grid-cols-2">
            <Feature
              title="See what changed"
              body="The map follows a diff: the parts an agent added, removed or rewrote are marked where they live, not buried in a file list."
            >
              <div className="flex flex-wrap gap-2">
                <Chip className="border-(--color-diff-add-line) bg-(--color-diff-add-surface) text-(--color-diff-add-ink)">
                  + Session Interface
                </Chip>
                <Chip className="border-amber-line bg-amber-surface text-amber-ink">~ Dispatch</Chip>
                <Chip className="border-(--color-diff-remove-line) bg-(--color-diff-remove-surface) text-(--color-diff-remove-ink)">
                  − Setup Guard
                </Chip>
              </div>
            </Feature>
            <Feature
              title="Ask about any section"
              body="Hand a section to Claude Code in the built-in terminal, along with the exact code its problems point at."
            >
              <div className="rounded-[10px] border bg-surface px-3 py-2.5 font-mono text-[11.5px] text-on-surface-variant">
                <span className="text-faint">›</span> why does Handling Requests push a context first?
              </div>
            </Feature>
          </div>
        </Section>

        <section className="relative mt-8">
          <div
            aria-hidden
            className="dotfield absolute inset-0 [mask-image:radial-gradient(ellipse_at_bottom,black,transparent_70%)]"
          />
          <div className="relative mx-auto max-w-[1180px] px-6 py-28 text-center">
            <h2 className="text-[28px] font-semibold leading-[1.2] tracking-[-0.02em]">See your own codebase.</h2>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <DownloadButton />
              <GithubButton />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-6 text-[12.5px] text-muted-slate">
          <span className="font-semibold text-ink">TBD</span>
          <a href={GITHUB} className="font-mono text-[11.5px] hover:text-ink">
            {REPO}
          </a>
        </div>
      </footer>
    </div>
  );
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-[1180px] px-6 pt-28">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.09em] text-faint">{eyebrow}</p>
      <h2 className="mb-10 mt-3 text-[28px] font-semibold leading-[1.2] tracking-[-0.02em]">{title}</h2>
      {children}
    </section>
  );
}

function Step({ n, title, body, children }: { n: number; title: string; body: string; children: ReactNode }) {
  return (
    <div className="flex flex-col rounded-[14px] border bg-pure-white">
      <div className="p-6 pb-5">
        <p className="font-mono text-[11px] text-faint">0{n}</p>
        <h3 className="mt-2 text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
        <p className="mt-1.5 text-[13.5px] leading-[1.6] text-on-surface-variant">{body}</p>
      </div>
      <div className="flex-1 border-t bg-warm-cream/60 p-5">{children}</div>
    </div>
  );
}

function Feature({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <div className="rounded-[14px] border bg-pure-white p-6">
      <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
      <p className="mb-5 mt-1.5 max-w-[440px] text-[13.5px] leading-[1.6] text-on-surface-variant">{body}</p>
      {children}
    </div>
  );
}

function Chip({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`rounded-[6px] border px-2 py-1 font-mono text-[11.5px] ${className}`}>{children}</span>;
}

// No build to link yet.
function DownloadButton({ compact }: { compact?: boolean }) {
  return (
    <a
      href="#"
      className={
        compact
          ? "rounded-[8px] bg-ink px-3 py-1.5 text-[13px] font-medium text-warm-cream transition-opacity hover:opacity-85"
          : "rounded-[10px] bg-ink px-5 py-2.5 text-[14px] font-medium text-warm-cream transition-opacity hover:opacity-85"
      }
    >
      Download for macOS
    </a>
  );
}

function GithubButton({ compact }: { compact?: boolean }) {
  return (
    <a
      href={GITHUB}
      className={
        compact
          ? "flex items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-[13px] text-muted-slate transition-colors hover:bg-surface-container-low hover:text-ink"
          : "flex items-center gap-2 rounded-[10px] border border-border-strong bg-pure-white px-4 py-2.5 text-[14px] font-medium transition-colors hover:border-faint"
      }
    >
      <svg viewBox="0 0 16 16" aria-hidden className="size-4 fill-current">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
      {compact ? "GitHub" : "Star on GitHub"}
      <StarCount repo={REPO} />
    </a>
  );
}
