import type { Metadata } from "next";
import { LandingDemo, type DemoMap } from "@/components/landing-demo";
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

async function stars(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, { next: { revalidate: 3600 } });
    return res.ok ? ((await res.json()).stargazers_count as number) : null;
  } catch {
    return null;
  }
}

export default async function Landing() {
  const count = await stars();
  const maps: DemoMap[] = DEMOS.map((d) => {
    const { RUN } = loadMap(d.id).file;
    return { ...d, files: RUN.files ?? 0, elapsed: RUN.elapsed ?? "" };
  });

  return (
    // The root layout locks the body for the canvas; this page scrolls itself.
    <div className="h-full overflow-y-auto bg-warm-cream text-ink">
      <header className="sticky top-0 z-10 border-b border-transparent bg-warm-cream/85 backdrop-blur-sm">
        <nav className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-4">
          <a href="/landing" className="text-[15px] font-semibold tracking-[-0.01em]">
            TBD
          </a>
          <div className="flex items-center gap-2">
            <GithubButton count={count} compact />
            <DownloadButton compact />
          </div>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-[1180px] px-6 pb-14 pt-20 text-center sm:pt-28">
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
            <GithubButton count={count} />
          </div>
        </section>

        <section aria-label="Live demo" className="mx-auto max-w-[1180px] px-6">
          <LandingDemo maps={maps} />
        </section>

        <section className="mx-auto max-w-[1180px] px-6 py-28">
          <p className="mb-10 font-mono text-[10.5px] uppercase tracking-[0.09em] text-faint">The problem</p>
          <div className="grid gap-px overflow-hidden rounded-[20px] border bg-border-gray sm:grid-cols-3">
            {PROBLEMS.map((p) => (
              <div key={p.title} className="bg-pure-white p-7">
                <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{p.title}</h2>
                <p className="mt-2 text-[14px] leading-[1.6] text-on-surface-variant">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[1180px] px-6 pb-28 text-center">
          <h2 className="text-[28px] font-semibold tracking-[-0.02em]">See your own codebase.</h2>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <DownloadButton />
            <GithubButton count={count} />
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

function GithubButton({ count, compact }: { count: number | null; compact?: boolean }) {
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
      {count === null ? null : (
        <span className="flex items-center gap-1 border-l border-border-gray pl-2 font-mono text-[12px] text-muted-slate tnum">
          <svg viewBox="0 0 16 16" aria-hidden className="size-3 fill-current">
            <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z" />
          </svg>
          {count}
        </span>
      )}
    </a>
  );
}
