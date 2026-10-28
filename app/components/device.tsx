"use client";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A phone in a workspace tab: the Android emulator or the iOS Simulator,
 * running with no window of its own (src-tauri/src/devices.rs), its screen
 * drawn here and touched here. Nothing is installed until the user asks:
 * until then the tab says what running the project's app here needs, and
 * setting it up runs in a terminal tab beside it, in view.
 */

export type Platform = "android" | "ios";

export const PLATFORM: Record<Platform, { label: string; device: string }> = {
  android: { label: "Android", device: "Android emulator" },
  ios: { label: "iOS", device: "iOS Simulator" },
};

interface Status {
  ready: boolean;
  missing: string[];
  running: string | null;
  location: string;
  size: string;
  can_setup: boolean;
  note: string | null;
}

type Phase = "idle" | "starting" | "running";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Device({
  platform,
  root,
  visible,
  onCommand,
}: {
  platform: Platform;
  root: string;
  visible: boolean;
  /** Runs a command in a new terminal tab of this project: setup, or a build. */
  onCommand: (command: string, label: string) => void;
}) {
  const { label, device } = PLATFORM[platform];
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<string | null>(null);

  const check = useCallback(() => {
    invoke<Status>("device_status", { platform })
      .then((s) => {
        setStatus(s);
        if (s.running) {
          setName(s.running);
          setPhase("running");
        }
      })
      .catch((e) => setError(String(e)));
  }, [platform]);

  // Asked again whenever the tab comes forward: setup may have finished in the terminal meanwhile.
  useEffect(() => {
    if (visible && phase === "idle") check();
  }, [visible, phase, check]);

  const start = () => {
    setPhase("starting");
    setError(null);
    invoke<{ id: string; name: string }>("device_start", { platform })
      .then((d) => {
        setName(d.name);
        setPhase("running");
      })
      .catch((e) => {
        setError(String(e));
        setPhase("idle");
      });
  };

  // The screen, one picture after another while the tab is in view.
  useEffect(() => {
    if (phase !== "running" || !visible) return;
    let gone = false;
    (async () => {
      let last: string | null = null;
      while (!gone) {
        try {
          const png = await invoke<ArrayBuffer>("device_frame", { platform });
          if (gone) break;
          const url = URL.createObjectURL(new Blob([png], { type: "image/png" }));
          setScreen(url);
          // Let go of the last one once the new one is drawn.
          const old = last;
          if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
          last = url;
          setError(null);
          await sleep(30);
        } catch (e) {
          if (!gone) setError(String(e));
          await sleep(1000);
        }
      }
    })();
    return () => {
      gone = true;
    };
  }, [phase, visible, platform]);

  // Claude's pointer, gliding to where its tap or swipe lands just before it
  // does (src-tauri/src/devices.rs), drawn as it is on a page (agent.js).
  const pane = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const hand = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let fade: ReturnType<typeof setTimeout> | undefined;
    const off = listen<{ platform: string; x: number; y: number; x2: number; y2: number; swipe: boolean }>("slop:device-touch", (e) =>
      // A frame on, once the tab has come forward (components/workspace.tsx) and the screen has a size.
      void setTimeout(() => glide(e.payload), 50),
    );
    const glide = ({ platform: on, x, y, x2, y2, swipe }: { platform: string; x: number; y: number; x2: number; y2: number; swipe: boolean }) => {
      const box = pane.current?.getBoundingClientRect();
      const r = img.current?.getBoundingClientRect();
      const p = hand.current;
      if (on !== platform || !box || !r || !p) return;
      const at = (fx: number, fy: number) => `translate(${r.left - box.left + fx * r.width}px, ${r.top - box.top + fy * r.height}px)`;
      p.style.opacity = "1";
      p.style.transform = at(x, y);
      if (swipe) setTimeout(() => (p.style.transform = at(x2, y2)), 380);
      else
        setTimeout(() => {
          ring.current?.style.setProperty("transform", at(x, y));
          ring.current?.animate([{ opacity: 0.95, scale: 0.3 }, { opacity: 0, scale: 1.7 }], { duration: 550, easing: "ease-out" });
        }, 380);
      clearTimeout(fade);
      fade = setTimeout(() => (p.style.opacity = "0"), 5000);
    };
    return () => {
      clearTimeout(fade);
      void off.then((f) => f());
    };
  }, [platform]);

  const send = (input: Record<string, unknown>) =>
    void invoke("device_input", { platform, input }).catch((e) => setError(String(e)));

  // A touch: a tap where it went down and up, a swipe if it moved.
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  const at = (e: React.PointerEvent<HTMLImageElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  // Typed text goes in batches, so a word is one command, not one per letter.
  const typed = useRef("");
  const flush = useRef<ReturnType<typeof setTimeout> | null>(null);
  const type = (ch: string) => {
    typed.current += ch;
    if (flush.current) clearTimeout(flush.current);
    flush.current = setTimeout(() => {
      send({ kind: "text", text: typed.current });
      typed.current = "";
    }, 150);
  };

  if (!status) {
    return (
      <Pane visible={visible}>
        <Middle>
          <p className="text-[12px] text-faint">Looking for the {device}…</p>
        </Middle>
      </Pane>
    );
  }

  if (!status.ready && phase !== "running") {
    return (
      <Pane visible={visible}>
        <Middle>
          <div className="flex max-w-[400px] flex-col gap-3 text-left">
            <h3 className="text-[15px] font-semibold text-ink">Run this project&apos;s {label} app here</h3>
            {platform === "android" ? (
              <p className="text-[13px] leading-relaxed text-on-surface-variant">
                It runs on Google&apos;s Android emulator, inside this tab. Android Studio is not needed. Setup downloads{" "}
                {status.missing.join(", ")} ({status.size}) into <span className="break-all font-mono text-[11.5px]">{status.location}</span>, in
                a terminal tab where you can watch it, accept Google&apos;s licenses, and stop it at any time.
              </p>
            ) : (
              <p className="text-[13px] leading-relaxed text-on-surface-variant">
                It runs on the iOS Simulator, inside this tab. The simulator only comes with Xcode, so setup opens Xcode in the App Store (
                {status.size}). Once it is installed, Set up again finishes the rest in a terminal tab. You never need to open Xcode itself.
              </p>
            )}
            {status.note ? <p className="text-[12px] text-muted-slate">{status.note}</p> : null}
            {error ? <p className="whitespace-pre-wrap font-mono text-[11.5px] text-clay-ink">{error}</p> : null}
            <div className="flex items-center gap-2 pt-1">
              {status.can_setup ? (
                <button
                  type="button"
                  onClick={() =>
                    void invoke<string>("device_setup", { platform })
                      .then((cmd) => onCommand(cmd, `${label} setup`))
                      .catch((e) => setError(String(e)))
                  }
                  className="cursor-pointer rounded-[2px] bg-deep-green px-3 py-1.5 text-[12.5px] text-white hover:bg-brand"
                >
                  Set up {device}
                </button>
              ) : null}
              <button
                type="button"
                onClick={check}
                className="cursor-pointer rounded-[2px] border border-border-strong px-3 py-1.5 text-[12.5px] text-ink hover:bg-surface-container"
              >
                Check again
              </button>
            </div>
          </div>
        </Middle>
      </Pane>
    );
  }

  if (phase !== "running") {
    return (
      <Pane visible={visible}>
        <Middle>
          {phase === "starting" ? (
            <>
              <p className="text-[13px] text-ink">Starting the {device}…</p>
              <p className="text-[12px] text-muted-slate">The first start can take a minute or two.</p>
            </>
          ) : (
            <>
              <p className="text-[13px] text-ink">The {device} is ready.</p>
              <button
                type="button"
                onClick={start}
                className="mt-2 cursor-pointer rounded-[2px] bg-deep-green px-3 py-1.5 text-[12.5px] text-white hover:bg-brand"
              >
                Start
              </button>
            </>
          )}
          {error ? <p className="mt-2 max-w-[420px] whitespace-pre-wrap font-mono text-[11.5px] text-clay-ink">{error}</p> : null}
        </Middle>
      </Pane>
    );
  }

  return (
    <Pane visible={visible}>
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-gray px-2 text-[12px]">
        <span className="min-w-0 truncate px-1 text-muted-slate">{name || device}</span>
        <div className="flex-1" />
        <Small onClick={() => send({ kind: "key", text: "home" })}>Home</Small>
        {platform === "android" ? <Small onClick={() => send({ kind: "key", text: "back" })}>Back</Small> : null}
        <button
          type="button"
          onClick={() =>
            void invoke<string>("device_run", { platform, root })
              .then((cmd) => onCommand(cmd, `${label} build`))
              .catch((e) => setError(String(e)))
          }
          title="Builds this project's app and opens it here, in a terminal tab"
          className="ml-1 cursor-pointer rounded-[2px] bg-deep-green px-2.5 py-0.5 text-white hover:bg-brand"
        >
          Run app
        </button>
      </div>
      {error || status.note ? (
        <p className={cn("shrink-0 truncate border-b border-border-gray px-3 py-1 text-[11.5px]", error ? "text-clay-ink" : "text-muted-slate")} title={error ?? status.note ?? ""}>
          {error ?? status.note}
        </p>
      ) : null}
      <div
        ref={pane}
        tabIndex={0}
        aria-label={`${device} screen: click to tap, drag to swipe, type to enter text`}
        onKeyDown={(e) => {
          if (e.metaKey || e.ctrlKey) return;
          if (e.key.length === 1) type(e.key);
          else if (e.key === "Enter") send({ kind: "key", text: "enter" });
          else if (e.key === "Backspace") send({ kind: "key", text: "delete" });
          else if (e.key === "Escape" && platform === "android") send({ kind: "key", text: "back" });
          else return;
          e.preventDefault();
        }}
        className="relative flex min-h-0 flex-1 items-center justify-center bg-surface-container p-4 outline-none"
      >
        {screen ? (
          // eslint-disable-next-line @next/next/no-img-element -- a stream of local frames, not an asset to optimise
          <img
            ref={img}
            src={screen}
            alt={`${device} screen`}
            draggable={false}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              (e.currentTarget.parentElement as HTMLElement).focus();
              down.current = { ...at(e), t: Date.now() };
            }}
            onPointerUp={(e) => {
              const from = down.current;
              down.current = null;
              if (!from) return;
              const to = at(e);
              if (Math.hypot(to.x - from.x, to.y - from.y) < 0.015) send({ kind: "tap", x: from.x, y: from.y });
              else send({ kind: "swipe", x: from.x, y: from.y, x2: to.x, y2: to.y, ms: Math.min(1000, Math.max(100, Date.now() - from.t)) });
            }}
            className="max-h-full max-w-full cursor-pointer select-none rounded-[22px] border-[5px] border-bezel object-contain"
          />
        ) : (
          <p className="text-[12px] text-faint">Waiting for the screen…</p>
        )}
        <div ref={ring} aria-hidden className="pointer-events-none absolute -left-3.5 -top-3.5 size-6 rounded-full border-2 border-[#d97757] opacity-0" />
        <div
          ref={hand}
          aria-hidden
          className="pointer-events-none absolute -left-0.5 -top-px opacity-0 drop-shadow-[0_1px_2px_rgba(0,0,0,.35)] transition-[transform,opacity] duration-[350ms] ease-[cubic-bezier(.3,.7,.25,1)]"
        >
          <svg width="22" height="24" viewBox="0 0 22 24">
            <path d="M2 1.5 2 19.5 7 15 10.5 22.5 13.6 21 10.2 13.8 17 13.8Z" fill="#d97757" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          <span className="absolute left-[18px] top-5 whitespace-nowrap rounded-[2px] bg-[#d97757] px-1.5 py-0.5 text-[11px] font-semibold leading-[1.3] text-white">Claude</span>
        </div>
      </div>
    </Pane>
  );
}

function Pane({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return <div className={cn("absolute inset-0 flex flex-col", !visible && "hidden")}>{children}</div>;
}

function Middle({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-8 text-center">{children}</div>;
}

function Small({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="cursor-pointer rounded-[2px] px-2 py-0.5 text-muted-slate hover:bg-surface-container hover:text-ink">
      {children}
    </button>
  );
}
