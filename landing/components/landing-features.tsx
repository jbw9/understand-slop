"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import f from "./landing-features.module.css";

/**
 * The desktop app's other tools, drawn: the workspace, plans, diffs and the
 * running app need the desktop app, so the live frame (a static export of a
 * map) can't show them. Each is drawn from the real components' markup and
 * the flask demo map's own names, and plays once when its tab opens.
 */
export type Drawing = "claude" | "plan" | "review" | "run";

/**
 * The size the drawings are laid out for. They scale to the stage, never
 * smaller than this in either direction, so a short laptop screen and a phone
 * see the same composition, only smaller.
 */
const WIDE = 1100;
const TALL = 680;

/** When a piece arrives (`--t`) and, for one that passes, leaves (`--u`): seconds after the tab opens. */
const at = (t: number, u?: number) => ({ "--t": `${t}s`, ...(u === undefined ? {} : { "--u": `${u}s` }) }) as CSSProperties;

export function Drawn({ drawing }: { drawing: Drawing }) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ k: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current!;
    const measure = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      const k = Math.min(1.2, el.clientWidth / WIDE, el.clientHeight / TALL);
      setFit({ k, w: el.clientWidth / k, h: el.clientHeight / k });
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const Scene = SCENES[drawing];
  return (
    <div ref={box} aria-hidden className={f.fit}>
      {fit ? (
        <div className={f.app} style={{ width: fit.w, height: fit.h, transform: `scale(${fit.k})` }}>
          <Scene />
        </div>
      ) : null}
    </div>
  );
}

/* ── Claude Code beside the map ─────────────────────────── */

function ClaudeScene() {
  return (
    <>
      <Strip>
        <Tab on>
          <span className={f.swap}>
            <span className={f.out} style={at(0, 5.6)}>
              Handling Requests
            </span>
            <span className={f.in} style={at(5.6)}>
              Saving A Session
            </span>
          </span>
        </Tab>
      </Strip>
      <div className={f.main} style={{ "--ws": "40%" } as CSSProperties}>
        <div className={`${f.page} ${f.out}`} style={at(0, 5.6)}>
          <Head trail={["flask", "Handling Requests"]} eyebrow="Inside flask" title="Handling Requests" sub={HANDLING_SUB} />
          <p className={f.cap}>
            {HANDLING_CAPTION}
            <span>colours match the parts below</span>
          </p>
          <Picture view={TOP_RIGHT} lit="session">
            <svg className={f.mouse} style={{ left: "84%", top: "23%" }} viewBox="0 0 16 16">
              <path d="M2.5 1.5v12l3.2-3 2.2 4.7 2.1-1-2.2-4.6h4.4z" />
            </svg>
            <div data-chrome className={`${f.menu} ${f.blip}`} style={{ right: "16%", top: "34%", ...at(1.35, 2.45) }}>
              <span>Open in new tab</span>
              <span>Add to Claude context</span>
              <span className={f.hot} style={at(2)}>
                Add and open Claude
              </span>
            </div>
          </Picture>
        </div>
        <div className={`${f.page} ${f.in}`} style={at(5.7)}>
          <Head
            trail={["flask", "Handling Requests", "Session Management", "Saving A Session"]}
            eyebrow="Inside Session Management"
            title="Saving A Session"
            sub="Serialise modified session data into a signed Set-Cookie header on the response"
          />
          <p className={f.detail}>
            Called in <code>process_response</code>. If the session is empty and modified the cookie is deleted; if{" "}
            <code>should_set_cookie</code> returns false the cookie is skipped entirely.
          </p>
          <ol className={f.flow}>
            {SAVE_STEPS.map(([title, body], i) => (
              <li key={title} className={f.in} style={at(5.9 + i * 0.12)}>
                <i>{i + 1}</i>
                <b>{title}</b>
                <span>{body}</span>
              </li>
            ))}
          </ol>
        </div>
        <Workspace
          tabs={
            <>
              <WsTab on icon={<ClaudeIcon />}>
                claude 1
              </WsTab>
              <WsTab icon={<TerminalIcon />}>zsh 2</WsTab>
            </>
          }
          strip={
            <>
              <span className={f.in} style={at(2.5)}>
                context
              </span>
              <span className={f.swap}>
                <span className={`${f.chip} ${f.blip}`} data-queued style={at(2.5, 4.6)}>
                  <i>◷</i>Session Interface<em>×</em>
                </span>
                <span className={`${f.chip} ${f.in}`} style={at(4.6)}>
                  <i>✓</i>Session Interface<em>×</em>
                </span>
              </span>
              <span className={`${f.clear} ${f.in}`} style={at(2.5)}>
                clear
              </span>
            </>
          }
        >
          <div className={f.term}>
            <Hello />
            <p className={`${f.you} ${f.in}`} style={at(4.6)}>
              &gt; {QUESTION}
            </p>
            <div className={`${f.msg} ${f.in}`} style={at(5.15)}>
              <span className={f.ok}>⏺</span>
              <span>
                <b>Bash</b>(slop-map-show section &quot;Saving A Session&quot;)
                <br />
                <span className={f.res}>⎿&nbsp;&nbsp;Showing Saving A Session</span>
              </span>
            </div>
            <div className={`${f.msg} ${f.in}`} style={at(6.3)}>
              <span>⏺</span>
              <span>
                After your view returns. <b>process_response</b> runs the after_request hooks, then{" "}
                <b>save_session</b> (src/flask/sessions.py:337).
              </span>
            </div>
            <div className={`${f.msg} ${f.in}`} style={at(7)}>
              <span />
              <span>
                It sets the cookie only when the session was modified, or is permanent with
                SESSION_REFRESH_EACH_REQUEST on. An empty, modified session deletes the cookie instead.
              </span>
            </div>
            <span className={f.grow} />
            <Prompt>
              <span className={f.typed} style={{ "--n": QUESTION.length, ...at(2.85, 4.6) } as CSSProperties}>
                {QUESTION}
              </span>
            </Prompt>
            <p className={f.hint}>? for shortcuts</p>
          </div>
        </Workspace>
      </div>
    </>
  );
}

const QUESTION = "when does the session cookie get written?";

const SAVE_STEPS: [string, ReactNode][] = [
  ["Add Vary header", <>If <code>session.accessed</code>, adds <code>Vary: Cookie</code> to the response so caches key on the cookie.</>],
  ["Handle empty", "If the session is falsy and modified, deletes the cookie. If falsy and unmodified, returns early."],
  ["Check should_set_cookie", "Returns if not modified and not (permanent + SESSION_REFRESH_EACH_REQUEST)."],
  ["Serialize and set", <>Calls <code>signing_serializer.dumps(dict(session))</code>, then <code>response.set_cookie</code>.</>],
];

/* ── a plan, before it is built ─────────────────────────── */

/** The plan as written in plan mode. */
function PlanScene() {
  return (
    <>
      <Strip>
        <Tab>Desktop App</Tab>
        <Tab on>
          <PlanIcon />
          Plan
        </Tab>
      </Strip>
      <div className={f.main} style={{ "--ws": "36%" } as CSSProperties}>
        <div className={f.doc}>
          <article className={f.scroll} style={at(3.2)}>
            <header className={f.in} style={at(0.15)}>
              <p className={f.planMeta}>
                <span className={f.eyebrow}>Plan</span>
                <span>
                  6 steps · 7 files <b data-v="changed">~6</b> <b data-v="added">+1</b> · 2 min read
                </span>
              </p>
              <h3 className={f.planTitle}>Saved sign-ins for the Preview browser</h3>
              <p className={f.lede}>
                You sign in to a site once in the Preview, choose &ldquo;all projects&rdquo; or &ldquo;this project
                only&rdquo;, and from then on Claude opens it already signed in. Bluprint keeps the site&rsquo;s session cookies
                the way a browser does and never stores your password.
              </p>
            </header>
            <section className={f.in} style={at(0.4)}>
              <PlanDiagram />
              <PlanScreen />
            </section>
            <section className={f.in} style={at(0.65)}>
              <p className={f.eyebrow}>Steps</p>
              <ol className={f.steps}>
                {PLAN_STEPS.map((s, i) => (
                  <li key={i}>
                    <i>{i + 1}.</i>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </section>
            <section className={f.in} style={at(0.8)}>
              <p className={f.eyebrow}>Files</p>
              <ul className={f.files}>
                {PLAN_FILES.map(([v, path, why]) => (
                  <li key={path}>
                    <b data-v={v}>{v === "added" ? "+" : "~"}</b>
                    <code>{path}</code>
                    <span>{why}</span>
                  </li>
                ))}
              </ul>
            </section>
          </article>
          <footer className={`${f.ask} ${f.in}`} style={at(1.2)}>
            <div>
              <span className={f.askQ}>
                <i />
                Build this plan?
              </span>
              <span className={f.btn}>Yes, manually approve edits</span>
              <span className={`${f.btn} ${f.primary}`}>Yes, and auto-accept edits</span>
            </div>
            <div>
              <span className={f.field}>No, keep planning…</span>
              <span className={f.btn} data-off>
                Send
              </span>
            </div>
          </footer>
        </div>
        <Workspace
          tabs={
            <WsTab on icon={<ClaudeIcon />}>
              claude 1
            </WsTab>
          }
        >
          <div className={f.term}>
            <Hello cwd="~/code/bluprint" />
            <p className={f.you}>&gt; let me sign in to Instagram once and keep it for every project</p>
            <div className={`${f.msg} ${f.in}`} style={at(0.3)}>
              <span className={f.ok}>⏺</span>
              <span>
                <b>Read</b>(app/src-tauri/src/browser.rs)
                <br />
                <span className={f.res}>⎿&nbsp;&nbsp;Read 342 lines</span>
              </span>
            </div>
            <div className={`${f.msg} ${f.in}`} style={at(0.5)}>
              <span className={f.ok}>⏺</span>
              <span>
                <b>Read</b>(app/components/preview.tsx)
                <br />
                <span className={f.res}>⎿&nbsp;&nbsp;Read 1047 lines</span>
              </span>
            </div>
            <div className={`${f.choices} ${f.in}`} style={at(1)}>
              <p>Would you like to proceed?</p>
              <p>
                <b>❯ 1. Yes, and auto-accept edits</b>
              </p>
              <p>&nbsp;&nbsp;2. Yes, manually approve edits</p>
              <p>&nbsp;&nbsp;3. No, keep planning</p>
            </div>
            <span className={f.grow} />
            <Prompt />
            <p className={`${f.hint} ${f.planMode}`}>⏸ plan mode on (shift+tab to cycle)</p>
          </div>
        </Workspace>
      </div>
    </>
  );
}

type Change = "added" | "changed";

/** The plan's ```diagram, laid out as components/diff.tsx lays out a plan's boxes. */
const PLAN_BOXES: { label: string; sub: string; col: number; row: number; v?: Change }[] = [
  { label: "Claude", sub: "navigate / sign_in tools", col: 0, row: 0 },
  { label: "Preview tools", sub: "src-tauri/src/mcp.rs", col: 0, row: 1, v: "changed" },
  { label: "Sign-in bar", sub: "components/preview.tsx", col: 1, row: 0, v: "added" },
  { label: "Site rules", sub: "vault sign-ins.json (hosts only)", col: 1, row: 1, v: "added" },
  { label: "Web view", sub: "src-tauri/src/browser.rs", col: 1, row: 2, v: "changed" },
  { label: "Shared store", sub: "WebKit default, all projects", col: 2, row: 1 },
  { label: "Project store", sub: "WebKit store per project id", col: 2, row: 2, v: "added" },
];

const PLAN_ARROWS: { d: string; label: string; x: number; y: number; anchor?: "start" | "end"; v?: Change }[] = [
  { d: "M117 72V122", label: "sign_in", x: 125, y: 101, anchor: "start" },
  { d: "M222 153H267V43H310", label: "asks you", x: 267, y: 101, v: "added" },
  { d: "M417 72V122", label: "your choice", x: 425, y: 101, anchor: "start", v: "added" },
  { d: "M417 182V232", label: "picks store", x: 425, y: 211, anchor: "start", v: "added" },
  { d: "M522 250H588V153H610", label: "default", x: 582, y: 204, anchor: "end" },
  { d: "M522 272H610", label: "project-only", x: 562, y: 290, v: "added" },
];

const PLAN_BOX_W = 210;
const PLAN_BOX_H = 58;
const TINTS = {
  added: { ink: "var(--color-diff-add-ink)", surface: "var(--color-diff-add-surface)", line: "var(--color-diff-add-line)", mark: "+" },
  changed: { ink: "var(--color-amber-ink)", surface: "var(--color-amber-surface)", line: "var(--color-amber-line)", mark: "~" },
};

function PlanDiagram() {
  return (
    <figure className={f.planFig}>
      <figcaption>
        Where a sign-in is kept<span>green is new · amber changes</span>
      </figcaption>
      <svg viewBox="0 0 834 306">
        <defs>
          {(["added", "changed", "untouched"] as const).map((v) => (
            <marker key={v} id={`p-${v}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M1 1.2L7 4 1 6.8z" fill={v === "untouched" ? "var(--color-wire)" : TINTS[v].line} />
            </marker>
          ))}
        </defs>
        {PLAN_ARROWS.map((a) => {
          const t = a.v ? TINTS[a.v] : null;
          return (
            <g key={a.d} opacity={t ? 1 : 0.45}>
              <path d={a.d} fill="none" stroke={t?.line ?? "var(--color-wire)"} strokeWidth={t ? 2 : 1.5} markerEnd={`url(#p-${a.v ?? "untouched"})`} />
              <text
                x={a.x}
                y={a.y}
                textAnchor={a.anchor ?? "middle"}
                fontSize="12"
                fill={t?.ink ?? "var(--color-muted-slate)"}
                stroke="var(--color-warm-cream)"
                strokeWidth="4"
                strokeLinejoin="round"
                paintOrder="stroke"
              >
                {a.label}
              </text>
            </g>
          );
        })}
        {PLAN_BOXES.map((b) => {
          const x = 12 + b.col * 300;
          const y = 14 + b.row * 110;
          const t = b.v ? TINTS[b.v] : null;
          return (
            <g key={b.label} opacity={t ? 1 : 0.5}>
              <rect
                x={x}
                y={y}
                width={PLAN_BOX_W}
                height={PLAN_BOX_H}
                rx="3"
                fill={t?.surface ?? "var(--color-pure-white)"}
                stroke={t?.line ?? "var(--color-border-strong)"}
                strokeWidth={t ? 2 : 1.5}
              />
              <text x={x + PLAN_BOX_W / 2} y={y + 25} textAnchor="middle" fontSize="14.5" fontWeight="600" fill={t?.ink ?? "var(--color-ink)"}>
                {b.label}
              </text>
              <text x={x + PLAN_BOX_W / 2} y={y + 43} textAnchor="middle" fontSize="12" fill="var(--color-faint)">
                {b.sub}
              </text>
              {t ? (
                <text x={x + PLAN_BOX_W - 11} y={y + 18} textAnchor="middle" fontSize="15" fontWeight="700" fill={t.ink}>
                  {t.mark}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** The plan's ```screen, as components/blocks.tsx draws a web screen with its notes numbered. */
const PLAN_SCREEN: { type: "heading" | "choice" | "button" | "image"; label: string; note: string }[] = [
  { type: "heading", label: "Claude needs you to sign in to instagram.com", note: "new bar above the page; Claude can't type into the page while it's showing" },
  { type: "choice", label: "Keep this sign-in for: All projects · Only this project", note: "new; the default is 'All projects' for social sites and 'Only this project' for everything else" },
  { type: "button", label: "I'm signed in", note: "new; Claude carries on" },
  { type: "image", label: "the site's own login page", note: "you type your password here yourself" },
];

function PlanScreen() {
  return (
    <div className={f.planScreen}>
      <div className={f.browser}>
        <div className={f.browserBar}>
          <span>
            <i />
            <i />
            <i />
          </span>
          <p>instagram.com/reel/…</p>
        </div>
        <div className={f.browserBody}>
          <p className={f.screenTitle}>Preview, Claude needs a sign-in</p>
          {PLAN_SCREEN.map((it, i) => (
            <div key={it.label} className={f.thing} data-type={it.type}>
              {it.label}
              <em>{i + 1}</em>
            </div>
          ))}
        </div>
      </div>
      <ol className={f.notes}>
        {PLAN_SCREEN.map((it, i) => (
          <li key={it.label}>
            <em>{i + 1}</em>
            <span>
              <b>{it.label}</b> — {it.note}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const PLAN_STEPS = [
  "Give every project its own WebKit cookie store, next to the shared one that already persists today.",
  "Keep a short list of which sites use which store: shared sites in the vault and project-only sites in the project's folder. The list holds site names only, never secrets.",
  "When the web view opens a site, use the store that site's rule names. If the store has to change, close the view and reopen it.",
  "Add a sign_in tool for Claude. It shows the bar, you pick where to keep the sign-in, the page reopens in that store, and you sign in yourself.",
  "While the bar is up, block Claude from typing into the page. Always block it from reading or filling password fields.",
  "Add “Saved sign-ins” to settings with a Forget button for each site. Removing a project also deletes its store.",
];

const PLAN_FILES: [Change, string, string][] = [
  ["changed", "app/src-tauri/src/browser.rs", "open the web view with a per-project store"],
  ["changed", "app/src-tauri/Cargo.toml", "turn on the WebKit data-store features"],
  ["changed", "app/src-tauri/src/mcp.rs", "add the sign_in tool"],
  ["changed", "app/components/preview.tsx", "sign-in bar, choose the store when opening a site"],
  ["added", "app/lib/sign-ins.ts", "read and write site rules"],
  ["changed", "app/src-tauri/src/agent.js", "refuse to fill or reveal password fields"],
  ["changed", "app/components/settings.tsx", "saved sign-ins, with Forget"],
];

/* ── a change, on the map ───────────────────────────────── */

function ReviewScene() {
  return (
    <>
      <Strip>
        <Tab on>Handling Requests</Tab>
      </Strip>
      <div className={f.diffBar}>
        <span className={f.showing}>
          <i />
          <b>Showing changes</b>
          <span>Reviewing cap-flashes</span>
        </span>
        <span className={f.legend}>
          <span data-v="added">+ new</span>
          <span data-v="changed">~ changed</span>
          <span data-v="removed">− gone</span>
        </span>
        <span className={f.stepper}>
          <span>‹ Prev</span>
          <span className={f.count}>1 of 2 changed</span>
          <span>Next ›</span>
          <i />
          <span>History</span>
          <span className={f.quiet}>Exit</span>
        </span>
      </div>
      <div className={f.main}>
        <div className={`${f.page} ${f.review}`}>
          <Head trail={["flask", "Handling Requests"]} eyebrow="Inside flask" title="Handling Requests" />
          <p className={f.cap}>
            {HANDLING_CAPTION}
            <span>colours match the parts below</span>
          </p>
          <div className={`${f.narrow} ${f.in}`} style={at(0.1)}>
            <Picture marks={{ helpers: "changed", dispatch: "near" }} tags={{ helpers: [3, 1] }} recede />
          </div>
          <div className={`${f.changes} ${f.in}`} style={at(0.35)}>
            <p>1 part of this picture changed — open one to read its lines</p>
            <div className={f.change}>
              <span className={f.caret}>▾</span>
              <b className={f.mark}>~</b>
              <b>Helpers</b>
              <span className={f.word}>changed</span>
              <span className={f.faint}>1 file</span>
              <span className={f.stat}>
                <span data-v="added">+3</span>
                <span data-v="removed">−1</span>
                <Blocks added={3} removed={1} />
              </span>
              <span className={f.openLink}>open ›</span>
            </div>
            <div className={f.hunkWrap}>
              <p className={f.path}>src/flask/helpers.py</p>
              <pre className={f.hunk}>
                <span className={f.hunkHead}>line 348</span>
                {HUNK.map(([k, old, now, text], i) => (
                  <span key={i} className={`${f.line} ${f.in}`} data-k={k} style={at(0.55 + i * 0.07)}>
                    <span>{old}</span>
                    <span>{now}</span>
                    <span>{k === " " ? "" : k === "+" ? "+" : "−"}</span>
                    <code>{tint(text)}</code>
                  </span>
                ))}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** flash() in src/flask/helpers.py at the demo map's commit, with a change a reviewer might be handed. */
const HUNK: [" " | "+" | "-", number | "", number | "", string][] = [
  ["-", 348, "", '    flashes = session.get("_flashes", [])'],
  ["+", "", 348, '    flashes = list(session.get("_flashes", []))'],
  [" ", 349, 349, "    flashes.append((category, message))"],
  ["+", "", 350, '    limit = current_app.config["MAX_FLASHED_MESSAGES"]'],
  ["+", "", 351, "    del flashes[:-limit]"],
  [" ", 350, 352, '    session["_flashes"] = flashes'],
  [" ", 351, 353, "    app = current_app._get_current_object()"],
];

/** Strings, comments and the one keyword, in the drawer's own colours. */
function tint(line: string) {
  return line.split(/("[^"]*"|#.*$|\bdel\b)/).map((p, i) =>
    i % 2 ? (
      <span key={i} data-tok={p.startsWith('"') ? "string" : p.startsWith("#") ? "comment" : "keyword"}>
        {p}
      </span>
    ) : (
      p
    ),
  );
}

/** GitHub's five squares, as the app draws them beside a change. */
function Blocks({ added, removed }: { added: number; removed: number }) {
  const green = Math.round((added / (added + removed)) * 5);
  return (
    <span className={f.blocks}>
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} data-v={i < green ? "added" : "removed"} />
      ))}
    </span>
  );
}

/* ── the app running: a preview, and a phone ───────────── */

const HABITS: { name: string; streak: number; done?: boolean; tap?: number }[] = [
  { name: "Morning run", streak: 12, done: true },
  { name: "Read 20 pages", streak: 4, tap: 2 },
  { name: "Drink water", streak: 31, done: true },
  { name: "Stretch", streak: 2, tap: 4.05 },
  { name: "Call home", streak: 1 },
];

function RunScene() {
  return (
    <>
      <Strip>
        <Tab>habits</Tab>
        <Tab on>
          <GlobeIcon />
          Preview
        </Tab>
      </Strip>
      <div className={f.main} style={{ "--ws": "300px" } as CSSProperties}>
        <div className={f.preview}>
          <div data-chrome className={f.toolbar}>
            <Glyph d="M10 3.5 5.5 8l4.5 4.5" />
            <Glyph d="M6 3.5 10.5 8 6 12.5" />
            <Glyph d="M12.5 8a4.5 4.5 0 1 1-1.3-3.2M12.5 3v2.5H10" />
            <span className={f.address}>localhost:8081</span>
            <span className={f.sizes}>
              <Glyph d="M5.5 2h5a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM7.5 12h1" />
              <Glyph d="M3.5 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM7.5 12h1" />
              <Glyph on d="M1.5 3h13v8.5h-13zM5.5 14h5M8 11.5V14" />
            </span>
            <Glyph d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v4h-9v-9h4" />
          </div>
          <div className={f.site}>
            <nav>
              <b>
                <i />
                Habits
              </b>
              <span data-on>Today</span>
              <span>Stats</span>
              <span>Settings</span>
            </nav>
            <div className={f.siteBody}>
              <p className={f.date}>Sunday, 1 November</p>
              <div className={f.siteHead}>
                <h4>Today</h4>
                <Done shift={0.3} />
              </div>
              <ul className={f.habits}>
                {HABITS.map((h) => (
                  <Habit key={h.name} {...h} tap={h.tap && h.tap + 0.3} />
                ))}
              </ul>
            </div>
          </div>
        </div>
        <Workspace
          tabs={
            <>
              <WsTab icon={<ClaudeIcon />}>claude 1</WsTab>
              <WsTab on icon={<PhoneIcon />}>
                iOS
              </WsTab>
            </>
          }
        >
          <div className={f.device}>
            <span className={f.deviceName}>iPhone 16 Pro</span>
            <span className={f.small}>Home</span>
            <span className={f.runApp}>Run app</span>
          </div>
          <div className={f.dock}>
            <div className={f.phone}>
              <div className={f.status}>
                <b>9:41</b>
                <i />
                <span>
                  <Glyph d="M2 12h1.5M5.5 10h1.5v2H5.5zM9 8h1.5v4H9zM12.5 5.5H14V12h-1.5z" />
                </span>
              </div>
              <div className={f.phoneHead}>
                <p>Sunday, 1 November</p>
                <h4>Today</h4>
              </div>
              <Done />
              <ul className={`${f.habits} ${f.phoneList}`}>
                {HABITS.map((h) => (
                  <Habit key={h.name} {...h} />
                ))}
              </ul>
              <span className={f.tap} style={{ left: 27, top: 216, ...at(1.95) }} />
              <span className={f.tap} style={{ left: 27, top: 320, ...at(4) }} />
              <div className={f.hand}>
                <svg width="22" height="24" viewBox="0 0 22 24">
                  <path d="M2 1.5 2 19.5 7 15 10.5 22.5 13.6 21 10.2 13.8 17 13.8Z" />
                </svg>
                <span>Claude</span>
              </div>
            </div>
          </div>
        </Workspace>
      </div>
    </>
  );
}

/** "2 of 5 done", counting up as Claude taps. `shift` delays it, for the page that hears of the tap later. */
function Done({ shift = 0 }: { shift?: number }) {
  return (
    <div className={f.done}>
      <span className={f.swap}>
        <span className={f.out} style={at(0, 2 + shift)}>
          2 of 5 done
        </span>
        <span className={f.blip} style={at(2 + shift, 4.05 + shift)}>
          3 of 5 done
        </span>
        <span className={f.in} style={at(4.05 + shift)}>
          4 of 5 done
        </span>
      </span>
      <span className={f.bar}>
        <i style={{ animationDelay: `${shift}s` }} />
      </span>
    </div>
  );
}

function Habit({ name, streak, done, tap }: { name: string; streak: number; done?: boolean; tap?: number }) {
  const days = (n: number) => `${n} day streak`;
  return (
    <li>
      <span className={f.check} data-done={done || tap !== undefined || undefined}>
        {done || tap === undefined ? null : <i className={f.pop} style={at(tap)} />}
      </span>
      <span className={f.habit}>
        <b>{name}</b>
        {tap === undefined ? (
          <span>{days(streak)}</span>
        ) : (
          <span className={f.swap}>
            <span className={f.out} style={at(0, tap)}>
              {days(streak)}
            </span>
            <span className={f.in} style={at(tap)}>
              {days(streak + 1)}
            </span>
          </span>
        )}
      </span>
    </li>
  );
}

const SCENES: Record<Drawing, () => ReactNode> = {
  claude: ClaudeScene,
  plan: PlanScene,
  review: ReviewScene,
  run: RunScene,
};

/* ── the app's own pieces ───────────────────────────────── */

/** The map's tabs, as the app draws them: dark in either theme. */
function Strip({ children }: { children: ReactNode }) {
  return (
    <div data-chrome className={f.strip}>
      {children}
      <span className={f.add}>+</span>
    </div>
  );
}

function Tab({ on, children }: { on?: boolean; children: ReactNode }) {
  return (
    <span className={f.tab} data-on={on || undefined}>
      {children}
    </span>
  );
}

/** The floating window of terminals, previews and phones, over the map's right edge. */
function Workspace({ tabs, strip, children }: { tabs: ReactNode; strip?: ReactNode; children: ReactNode }) {
  return (
    <aside data-chrome className={f.ws}>
      <div className={f.wsTabs}>
        {tabs}
        <span className={f.wsBtn}>+</span>
        <span className={f.wsRest} />
        <span className={f.wsBtn}>✕</span>
      </div>
      <div className={f.wsBody}>{children}</div>
      {strip ? <div className={f.wsStrip}>{strip}</div> : null}
    </aside>
  );
}

function WsTab({ on, icon, children }: { on?: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <span className={f.wsTab} data-on={on || undefined}>
      {icon}
      {children}
    </span>
  );
}

function Hello({ cwd = "~/code/flask" }: { cwd?: string }) {
  return (
    <div className={f.hello}>
      <p>
        <b>✻</b> Welcome to Claude Code!
      </p>
      <p className={f.res}>/help for help, /status for your current setup</p>
      <p className={f.res}>cwd: {cwd}</p>
    </div>
  );
}

function Prompt({ children }: { children?: ReactNode }) {
  return (
    <div className={f.prompt}>
      &gt; {children}
      <i className={f.cursor} />
    </div>
  );
}

function Head({ trail, eyebrow, title, sub }: { trail: string[]; eyebrow: string; title: string; sub?: string }) {
  return (
    <header>
      <p className={f.crumbs}>{trail.join("  ›  ")}</p>
      <p className={f.eyebrow}>{eyebrow}</p>
      <h3 className={f.title}>{title}</h3>
      {sub ? <p className={f.sub}>{sub}</p> : null}
    </header>
  );
}

const HANDLING_SUB = "Push contexts, access request and session globals, serve files, flash messages, and handle errors at runtime.";
const HANDLING_CAPTION = "How a WSGI request flows through Flask's context and dispatch machinery";

/* ── the Handling Requests picture, from the flask demo map ── */

type BoxId = "wsgi" | "appctx" | "cv" | "session" | "wrappers" | "preprocess" | "dispatch" | "finalize" | "debug" | "helpers";

/** `sec`: which of the level's parts the box opens, so its colour matches that part's. */
const BOXES: { id: BoxId; label: string; col: number; row: number; sec?: number }[] = [
  { id: "wsgi", label: "WSGI Server", col: 0, row: 0 },
  { id: "appctx", label: "AppContext", col: 1, row: 0, sec: 1 },
  { id: "cv", label: "_cv_app ContextVar", col: 2, row: 0, sec: 2 },
  { id: "session", label: "Session Interface", col: 3, row: 0, sec: 4 },
  { id: "wrappers", label: "Request / Response", col: 0, row: 1, sec: 3 },
  { id: "preprocess", label: "Preprocess", col: 1, row: 1 },
  { id: "dispatch", label: "Dispatch", col: 2, row: 1 },
  { id: "finalize", label: "Finalize", col: 3, row: 1 },
  { id: "debug", label: "Debug & Logging", col: 0, row: 2, sec: 6 },
  { id: "helpers", label: "Helpers", col: 2, row: 2, sec: 5 },
];

const ARROWS: { d: string; label: string; x: number; y: number; anchor?: "start" | "end" }[] = [
  { d: "M182 39H301", label: "from_environ", x: 242, y: 31 },
  { d: "M472 39H591", label: "push sets _cv_app", x: 532, y: 31 },
  { d: "M762 39H881", label: "opens session", x: 822, y: 31 },
  { d: "M97 64V133", label: "Request(environ)", x: 105, y: 103, anchor: "start" },
  { d: "M387 64V133", label: "before_request", x: 395, y: 103, anchor: "start" },
  { d: "M472 159H591", label: "calls view", x: 532, y: 151 },
  { d: "M762 159H881", label: "return value", x: 822, y: 151 },
  { d: "M967 134V65", label: "save_session", x: 959, y: 103, anchor: "end" },
  { d: "M677 184V253", label: "view code uses", x: 685, y: 223, anchor: "start" },
];

/** Parts of the picture, where a narrower column would shrink the whole of it past reading. */
const TOP_RIGHT = "292 0 772 200";

const BOX_W = 170;
const BOX_H = 50;
const boxAt = (b: { col: number; row: number }) => ({ x: 12 + b.col * 290, y: 14 + b.row * 120 });

/**
 * `marks`: a change drawn as the map draws one in diff mode — amber where the
 * code changed, dashed where a box calls into it, the rest receding.
 * `tags`: the change's size, on the box's top edge. `lit`: the box a right
 * click is on. `view`: the part of the picture shown.
 */
function Picture({
  view = "0 0 1064 318",
  marks = {},
  tags = {},
  recede,
  lit,
  children,
}: {
  marks?: Partial<Record<BoxId, "changed" | "near">>;
  tags?: Partial<Record<BoxId, [number, number]>>;
  recede?: boolean;
  lit?: BoxId;
  view?: string;
  children?: ReactNode;
}) {
  return (
    <div className={f.pic}>
      <svg viewBox={view}>
        <defs>
          <marker id="f-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M1 1.2L7 4 1 6.8z" fill="var(--color-wire)" />
          </marker>
        </defs>
        {ARROWS.map((a) => (
          <g key={a.d} opacity={recede ? 0.6 : 1}>
            <path d={a.d} fill="none" stroke="var(--color-wire)" strokeWidth="1.5" markerEnd="url(#f-arrow)" />
            <text
              x={a.x}
              y={a.y}
              textAnchor={a.anchor ?? "middle"}
              fontSize="12"
              fill="var(--color-muted-slate)"
              stroke="var(--color-warm-cream)"
              strokeWidth="4"
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {a.label}
            </text>
          </g>
        ))}
        {BOXES.map((b) => {
          const { x, y } = boxAt(b);
          const m = marks[b.id];
          const tag = tags[b.id];
          const sec = b.sec ? { fill: `var(--color-sec-${b.sec}-surface)`, ink: `var(--color-sec-${b.sec}-ink)` } : null;
          const fill = m === "changed" ? "var(--color-amber-surface)" : (sec?.fill ?? "var(--color-pure-white)");
          const ink = m === "changed" ? "var(--color-amber-ink)" : (sec?.ink ?? "var(--color-ink)");
          const stroke = m ? "var(--color-amber-line)" : (sec?.ink ?? "var(--color-border-strong)");
          return (
            <g key={b.id} opacity={recede && !m ? 0.45 : 1}>
              <rect
                x={x}
                y={y}
                width={BOX_W}
                height={BOX_H}
                rx="3"
                fill={fill}
                stroke={stroke}
                strokeWidth={m === "changed" ? 2 : 1}
                strokeOpacity={!m && sec ? 0.55 : 1}
                strokeDasharray={m === "near" ? "3 3" : undefined}
              />
              <text x={x + BOX_W / 2} y={y + 30} textAnchor="middle" fontSize="14.5" fontWeight="600" fill={ink}>
                {b.label}
              </text>
              {m === "changed" ? (
                <text x={x + BOX_W - 8} y={y + 15} textAnchor="end" fontSize="12" fontWeight="700" fill="var(--color-amber-ink)">
                  ~
                </text>
              ) : null}
              {tag ? (
                <g>
                  <rect x={x + 8} y={y - 9} width={58} height={18} rx="9" fill="var(--color-amber-surface)" stroke="var(--color-amber-line)" />
                  <text x={x + 15} y={y + 4} fontSize="11" fontWeight="600" fontFamily="var(--font-mono)">
                    <tspan fill="var(--color-diff-add-ink)">+{tag[0]}</tspan>
                    <tspan fill="var(--color-diff-remove-ink)"> −{tag[1]}</tspan>
                  </text>
                </g>
              ) : null}
              {lit === b.id ? (
                <rect
                  className={f.blip}
                  style={at(1.3, 2.6)}
                  x={x}
                  y={y}
                  width={BOX_W}
                  height={BOX_H}
                  rx="3"
                  fill="none"
                  stroke={ink}
                  strokeWidth="3.5"
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      {children}
    </div>
  );
}

/* ── icons, as the app draws them ───────────────────────── */

function Glyph({ d, on }: { d: string; on?: boolean }) {
  return (
    <span className={f.glyph} data-on={on || undefined}>
      <svg viewBox="0 0 16 16">
        <path d={d} />
      </svg>
    </span>
  );
}

function ClaudeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="#d97757">
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg viewBox="0 0 16 16" className={f.stroke}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M4.5 6.5 6.5 8l-2 1.5M8.5 10h3" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 16 16" className={f.stroke}>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c1.7 1.8 2.5 3.8 2.5 6S9.7 12.2 8 14C6.3 12.2 5.5 10.2 5.5 8S6.3 3.8 8 2Z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 16 16" className={f.stroke}>
      <rect x="4" y="1.5" width="8" height="13" rx="2" />
      <path d="M7 12h2" />
    </svg>
  );
}

function PlanIcon() {
  return (
    <svg viewBox="0 0 16 16" className={f.stroke}>
      <path d="M4 1.5h5.5L12 4v10.5H4z" />
      <path d="M6 7h4M6 9.5h4M6 12h2.5" />
    </svg>
  );
}
