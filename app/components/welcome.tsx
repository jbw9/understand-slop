"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Button, Kbd } from "@/components/button";
import { newProject, openFolder, openProjects } from "@/components/projects";
import { cn } from "@/lib/utils";
import { readSettings, saveSettings, useSettings, type Theme } from "@/lib/settings";
import type { MapEntry } from "@/lib/maps";

/**
 * The blank page: what the window shows with no project open — none asked
 * for, the one asked for is gone, or the open one was just deleted. Laid out
 * as VS Code's welcome is: Start on one side, Recent on the other, which with
 * no projects yet is just Start.
 */
export function NoProject({ maps }: { maps: MapEntry[] }) {
  const router = useRouter();
  const { onboarded } = useSettings();
  // The saved settings are only known in the browser: until then show
  // nothing, so a returning reader never sees the tour flash by.
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <main className="flex-1 bg-paper" />;
  if (!onboarded && !maps.length) return <Tour />;
  return (
    <main className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-paper px-6 py-16">
      <div className="w-full max-w-[640px]">
        <h1 className="font-display text-[32px] font-normal leading-[1.05] tracking-[-0.016em] text-ink">Map a repository</h1>
        <p className="mt-1 text-[14px] text-on-surface-variant">Claude Code reads it and writes a map you can open a level at a time, down to the line.</p>
        <div className="mt-8 grid gap-10 sm:grid-cols-2">
          <section>
            <h2 className="mb-2 text-[13px] font-semibold text-ink">Start</h2>
            <ul className="flex flex-col gap-1.5 text-[13px]">
              <li>
                <button type="button" onClick={() => void openFolder()} className={LINK}>
                  Open Folder…
                </button>
              </li>
              <li>
                <button type="button" onClick={newProject} className={LINK}>
                  New Project…
                </button>
              </li>
              {maps.length ? (
                <li>
                  <button type="button" onClick={() => openProjects()} className={LINK}>
                    Manage Projects…
                  </button>
                </li>
              ) : null}
            </ul>
          </section>
          {maps.length ? (
            <section>
              <h2 className="mb-2 text-[13px] font-semibold text-ink">Recent</h2>
              <ul className="flex flex-col gap-1.5 text-[13px]">
                {maps.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => router.push(`/?map=${encodeURIComponent(m.id)}`)} className={cn(LINK, "max-w-full truncate font-mono")}>
                      {m.label}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <p className="mt-10 flex items-center gap-1.5 text-[12px] text-faint">
          Once it is mapped, <Kbd>Ctrl K</Kbd> goes to any level.
        </p>
      </div>
    </main>
  );
}

const noop = () => () => {};
const finish = () => saveSettings({ ...readSettings(), onboarded: true });

/**
 * The first run: what a map is, shown by opening one, then the theme, then
 * the way in. Three steps, any of them skippable.
 */
function Tour() {
  const [step, setStep] = useState(0);
  const steps = [
    { title: "Your code, as a map", body: "Bluprint reads a repository and draws it a level at a time. Click a box to go down a level.", view: <Demo /> },
    { title: "Pick a look", body: "It changes as you choose. Settings can change it later.", view: <Themes /> },
    { title: "Map your first project", body: "Open a folder on this machine, or clone one from GitHub. Claude Code writes the map.", view: <Begin /> },
  ];
  const last = step === steps.length - 1;
  return (
    <main className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-paper px-6 py-16">
      <div className="w-full max-w-[640px]">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
          {step + 1} / {steps.length}
        </p>
        <div key={step} className="animate-[tour-in_220ms_ease-out]">
          <h1 className="mt-2 font-display text-[32px] font-normal leading-[1.05] tracking-[-0.016em] text-ink">{steps[step].title}</h1>
          <p className="mt-1 text-[14px] text-on-surface-variant">{steps[step].body}</p>
          <div className="mt-8">{steps[step].view}</div>
        </div>
        <div className="mt-10 flex items-center gap-2">
          <div className="mr-auto flex gap-1.5" aria-hidden>
            {steps.map((_, i) => (
              <span key={i} className={cn("h-1.5 w-6 transition-colors", i <= step ? "bg-accent" : "bg-border-gray")} />
            ))}
          </div>
          <Button variant="ghost" onClick={finish}>
            {last ? "Not now" : "Skip"}
          </Button>
          {step > 0 ? <Button onClick={() => setStep(step - 1)}>Back</Button> : null}
          {last ? null : (
            <Button variant="primary" onClick={() => setStep(step + 1)}>
              Next
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}

/* ── step 1: a map you can open ───────────────────────────────── */

type Node = { label: string; sub: string; kids?: Node[]; code?: string[] };

const SAMPLE: Node = {
  label: "my-app",
  sub: "the whole repository",
  kids: [
    {
      label: "Sign in",
      sub: "what a person does first",
      kids: [
        { label: "Login form", sub: "components/login.tsx", code: ["export function Login() {", "  const [email, setEmail] = useState(\"\");", "  return <form onSubmit={send}>…</form>;", "}"] },
        { label: "Session", sub: "lib/session.ts", code: ["export async function signIn(email: string) {", "  const token = await api.post(\"/login\", { email });", "  cookies.set(\"session\", token);", "}"] },
      ],
    },
    {
      label: "Checkout",
      sub: "paying for the cart",
      kids: [
        { label: "Cart", sub: "lib/cart.ts", code: ["export const total = (items: Item[]) =>", "  items.reduce((n, i) => n + i.price * i.qty, 0);"] },
        { label: "Payment", sub: "api/pay.ts", code: ["export async function POST(req: Request) {", "  const { cart } = await req.json();", "  return charge(total(cart.items));", "}"] },
      ],
    },
    { label: "Data", sub: "where things are kept", kids: [{ label: "Database", sub: "db/schema.sql", code: ["create table users (", "  id serial primary key,", "  email text unique", ");"] }] },
  ],
};

function Demo() {
  const [path, setPath] = useState<Node[]>([SAMPLE]);
  const here = path[path.length - 1];
  return (
    <div className="border border-border-strong bg-surface">
      <div className="flex items-center gap-1 border-b border-border-gray px-3 py-2 font-mono text-[11.5px]">
        {path.map((n, i) => (
          <span key={i} className="flex items-center gap-1">
            {i ? <span className="text-faint">/</span> : null}
            <button
              type="button"
              disabled={i === path.length - 1}
              onClick={() => setPath(path.slice(0, i + 1))}
              className={cn(i === path.length - 1 ? "text-ink" : "cursor-pointer text-accent hover:underline")}
            >
              {n.label}
            </button>
          </span>
        ))}
      </div>
      <div key={here.label} className="min-h-[168px] animate-[tour-in_180ms_ease-out] p-4">
        {here.code ? (
          <pre className="overflow-x-auto bg-code p-3 font-mono text-[12px] leading-[1.6] text-code-plain">{here.code.join("\n")}</pre>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {here.kids?.map((k, i) => (
              <button
                key={k.label}
                type="button"
                onClick={() => setPath([...path, k])}
                className="group cursor-pointer border border-border-strong bg-card p-3 text-left transition-[border-color,transform] duration-100 hover:-translate-y-px hover:border-accent"
              >
                <span className="block font-display text-[16px] text-ink" style={{ color: `var(--color-sec-${i + 1}-ink)` }}>
                  {k.label}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-slate">{k.sub}</span>
                <span className="mt-3 block font-mono text-[10.5px] uppercase tracking-[0.06em] text-faint group-hover:text-accent">
                  {k.code ? "View code →" : "Open →"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── step 2: the theme ────────────────────────────────────────── */

/** Each theme's own colours, so a card shows its theme whatever the page is in. */
const LOOKS: { value: Theme; label: string; note: string; bar: string; paper: string; ink: string; line: string; box: string; tint: string }[] = [
  { value: "classic", label: "Classic", note: "Cobalt ink on white", bar: "#0a0a0b", paper: "#ffffff", ink: "#2438c8", line: "#a9b3ee", box: "#f6f8fe", tint: "#e3e8fc" },
  { value: "light", label: "Light", note: "Plain, near-black ink", bar: "#f4f4f5", paper: "#ffffff", ink: "#111113", line: "#e4e4e7", box: "#f7f7f8", tint: "#ebebed" },
  { value: "dark", label: "Dark", note: "Easy at night", bar: "#000000", paper: "#0f0f11", ink: "#fafafa", line: "#3a3a40", box: "#18181b", tint: "#222226" },
];

function Themes() {
  const { theme } = useSettings();
  return (
    <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
      {LOOKS.map((l) => {
        const on = theme === l.value;
        return (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => saveSettings({ ...readSettings(), theme: l.value })}
            className={cn(
              "cursor-pointer border p-2 text-left transition-[border-color,box-shadow] duration-100",
              on ? "border-accent shadow-[0_0_0_1px_var(--color-accent)]" : "border-border-gray hover:border-border-strong",
            )}
          >
            <Mini look={l} />
            <span className="mt-2 flex items-center justify-between px-1">
              <span className="text-[13px] font-semibold text-ink">{l.label}</span>
              {on ? <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-accent">On</span> : null}
            </span>
            <span className="block px-1 text-[12px] text-muted-slate">{l.note}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The app in miniature: a title bar, a heading, three boxes, a line of code. */
function Mini({ look: l }: { look: (typeof LOOKS)[number] }) {
  return (
    <span className="block aspect-[4/3] overflow-hidden border" style={{ background: l.paper, borderColor: l.line }} aria-hidden>
      <span className="flex h-[12%] items-center gap-[3px] px-1.5" style={{ background: l.bar }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-[5px] rounded-full" style={{ background: l.line }} />
        ))}
      </span>
      <span className="block px-2.5 pt-2.5">
        <span className="block font-display text-[13px] leading-none" style={{ color: l.ink }}>
          my-app
        </span>
        <span className="mt-1.5 block h-[3px] w-1/2" style={{ background: l.line }} />
        <span className="mt-2.5 grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="block h-7 border p-1" style={{ background: l.box, borderColor: l.line }}>
              <span className="block h-[3px] w-3/4" style={{ background: l.ink }} />
            </span>
          ))}
        </span>
        <span className="mt-2 block h-5 p-1" style={{ background: l.tint }}>
          <span className="block h-[3px] w-2/3" style={{ background: l.ink, opacity: 0.6 }} />
        </span>
      </span>
    </span>
  );
}

/* ── step 3: the way in ───────────────────────────────────────── */

function Begin() {
  const go = (f: () => unknown) => () => {
    finish();
    void f();
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button type="button" onClick={go(openFolder)} className={CARD}>
        <span className="block text-[14px] font-semibold text-ink">Open Folder…</span>
        <span className="mt-1 block text-[12.5px] text-muted-slate">A repository already on this machine.</span>
      </button>
      <button type="button" onClick={go(newProject)} className={CARD}>
        <span className="block text-[14px] font-semibold text-ink">New Project…</span>
        <span className="mt-1 block text-[12.5px] text-muted-slate">Clone one from GitHub, then map it.</span>
      </button>
      <p className="flex items-center gap-1.5 text-[12px] text-faint sm:col-span-2">
        Once it is mapped, <Kbd>Ctrl K</Kbd> goes to any level.
      </p>
    </div>
  );
}

const CARD =
  "cursor-pointer border border-border-strong bg-card p-4 text-left transition-[border-color,transform] duration-100 hover:-translate-y-px hover:border-accent focus-visible:outline-2 focus-visible:outline-accent";

const LINK = "cursor-pointer text-left text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent";
