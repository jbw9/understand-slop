import type { ReactNode } from "react";
import { LandingChange, type Change } from "./landing-change";
import s from "./landing.module.css";

interface Source {
  who: string;
  work: string;
  href: string;
}

const LEVIN: Source = {
  who: "Isaac Levin",
  work: "“Why We Still Need an IDE”, JetBrains",
  href: "https://blog.jetbrains.com/blog/2026/10/20/why-we-still-need-an-ide/",
};
const WITTEVEEN: Source = {
  who: "Sam Witteveen",
  work: "“What is the Future of IDEs”",
  href: "https://www.youtube.com/watch?v=I5VxMzaBD6s",
};
const SO_SURVEY: Source = { who: "Stack Overflow", work: "Developer Survey 2025", href: "https://survey.stackoverflow.co/2025/ai" };
const METR: Source = {
  who: "METR",
  work: "experienced open-source developers with early-2025 AI",
  href: "https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/",
};

const READING = [
  { ...LEVIN, note: "Why the bottleneck moved from typing to verifying, and what that asks of our tools." },
  { ...WITTEVEEN, note: "A developer on what he still opens an IDE for: diffs, navigation, verification, docs." },
  { ...SO_SURVEY, note: "Developers use AI more than ever, and trust its accuracy less." },
  { ...METR, note: "Developers took 19% longer with AI, and believed they had been 20% faster." },
];

const TOOLS = ["Autocomplete", "Snippets", "Go to definition", "Find usages", "Rename symbol", "The file tree"];

/** A quote in the margin, beside the paragraph it answers, with where it was said. */
function Said({ by, children }: { by: Source; children: ReactNode }) {
  return (
    <figure className={s.said}>
      <blockquote>{children}</blockquote>
      <figcaption>
        {by.who}, <a href={by.href}>{by.work}</a>
      </figcaption>
    </figure>
  );
}

/** One part of the story: its words, and what was said about it in the margin. */
function Part({ id, title, children, side }: { id: string; title: string; children: ReactNode; side?: ReactNode }) {
  return (
    <div id={id} data-part={title} className={s.part}>
      <div className={s.partText}>
        <h3>{title}</h3>
        {children}
      </div>
      {side ? <aside className={s.side}>{side}</aside> : null}
    </div>
  );
}

/**
 * Why we built it, told in order: what the IDE was for, what changed, what
 * that cost, what the IDE still offers, and what we built instead. The fourth
 * part shows one real change both ways.
 */
export function LandingStory({ change }: { change: Change }) {
  const added = change.files.reduce((n, f) => n + f.add, 0);
  const removed = change.files.reduce((n, f) => n + f.del, 0);
  const widest = Math.max(...change.files.map((f) => f.add + f.del));

  return (
    <section id="why" data-trail="Why we built it" className={s.story} aria-labelledby="why-title">
      <div className={s.wrap}>
        <h2 id="why-title">Why we built it</h2>
        <p className={s.lede}>
          Agents now write in minutes what takes hours to read. The tools we read code with were built for a different
          job. Here is how we got here, and why we think the next IDE is one you read.
        </p>

        <Part
          id="why-writing"
          title="Writing used to be the slow part."
          side={
            <Said by={WITTEVEEN}>
              The IDEs are really not where you write code anymore. It&rsquo;s where you read it, where you check it,
              where you decide whether it ships.
            </Said>
          }
        >
          <p>
            For forty years, every tool around the editor existed to make writing faster, or to help you find your way
            around code you already knew.
          </p>
          <ul className={s.tools} aria-label="What an IDE gives you">
            {TOOLS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p>None of them tells you what a part of the program is for. You knew that already: you wrote it.</p>
        </Part>
      </div>

      <div id="why-cheap" data-part="Then writing got cheap." className={s.band}>
        <pre className={s.wall} aria-hidden>
          {change.wall.map((l, i) => (
            <span key={i} data-sign={l[0]}>
              {l}
            </span>
          ))}
        </pre>
        <div className={`${s.wrap} ${s.bandIn}`}>
          <div className={s.bandText}>
            <h3>Then writing got cheap.</h3>
            <p>
              On 4 November, Claude Code added saved sign-ins to Mira&rsquo;s Preview. Twelve files and{" "}
              {added.toLocaleString("en-US")} new lines, in one sitting. This is what reviewing it looks like from a
              terminal.
            </p>
          </div>
          <figure className={s.statFig}>
            <figcaption className={s.cmd}>
              <span aria-hidden>$ </span>git show --stat {change.commit}
            </figcaption>
            <ul className={s.stat}>
              {change.files.map((f) => (
                <li key={f.path}>
                  <span className={s.path}>{f.path}</span>
                  <span className={s.counts}>
                    +{f.add} −{f.del}
                  </span>
                  <span className={s.bars} aria-hidden style={{ "--w": (f.add + f.del) / widest } as React.CSSProperties}>
                    <i style={{ flexGrow: f.add }} />
                    {f.del ? <b style={{ flexGrow: f.del }} /> : null}
                  </span>
                </li>
              ))}
            </ul>
            <p className={s.total}>
              {change.files.length} files changed, {added} insertions(+), {removed} deletions(−)
            </p>
          </figure>
          <Said by={WITTEVEEN}>
            From the terminal alone you really can&rsquo;t see any of that.
          </Said>
        </div>
      </div>

      <div className={s.wrap}>
        <Part
          id="why-reading"
          title="Reading didn’t get faster."
          side={
            <Said by={LEVIN}>
              Code being correct and code being yours are two different things. Accountability doesn&rsquo;t transfer
              just because the authorship did.
            </Said>
          }
        >
          <p>
            In a 2025 study, experienced open-source developers took 19% longer to finish real tasks with AI tools. They
            had expected to be 24% faster, and afterwards they still believed they had been 20% faster.
          </p>
          <Gap />
          <p>
            In Stack Overflow&rsquo;s 2025 survey, 66% of developers said AI answers are &ldquo;almost right, but not
            quite&rdquo;, and 45% said debugging AI-generated code takes longer. Only 3% highly trust what it writes.
          </p>
        </Part>

        <Part
          id="why-files"
          title="The IDE still shows you files."
          side={
            <Said by={LEVIN}>If you can&rsquo;t see what it&rsquo;s seeing, you&rsquo;re not actually steering it.</Said>
          }
        >
          <p>
            Two pieces from October 2026 argue that we still need an IDE: for diffs, for finding your way, for checking.
            We agree about the problem. But go to definition, find usages and the file tree were built for code you
            already know. For code you didn&rsquo;t write, what&rsquo;s missing is what each part is for and how the parts
            connect.
          </p>
          <p>
            Here is the same change again. Twelve files is a list you read top to bottom. On the map it&rsquo;s two parts
            of the product, and inside one of them, four.
          </p>
        </Part>
        <LandingChange change={change} />

        <Part
          id="why-map"
          title="So we built the map."
          side={<Said by={LEVIN}>You can&rsquo;t own code you don&rsquo;t understand.</Said>}
        >
          <p>
            Reading every line doesn&rsquo;t scale to the speed agents write at. Reading at the right height does: the
            shape of the program first, then the lines only where the shape changed, or where the risk is.
          </p>
          <p>
            Code maps have been tried before. They were something you opened once, when you joined a team. Agents changed
            that: now there is code you didn&rsquo;t write every day, and someone still has to own it.
          </p>
          <p>
            Mira sits beside your editor and your agent, and replaces neither. It&rsquo;s the part you read.
          </p>
        </Part>

        <div className={s.reading}>
          <h3>Sources</h3>
          <ul>
            {READING.map((r) => (
              <li key={r.href}>
                <a href={r.href}>
                  {r.who}, {r.work}
                </a>
                <span>{r.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// METR, 2025: how much faster developers expected and believed they were, against what was measured.
const GAP = [
  { label: "Expected, before", value: 24 },
  { label: "Believed, after", value: 20 },
  { label: "Measured", value: -19 },
];
const SPAN = 30;
const at = (v: number) => `${((v + SPAN) / (2 * SPAN)) * 100}%`;

/** One scale, slower to faster: where developers thought they were, and where they were. */
function Gap() {
  const [, believed, measured] = GAP;
  return (
    <figure className={s.gap}>
      <div className={s.gapPlot} aria-hidden>
        <span className={s.gapBand} style={{ left: at(measured.value), width: `${((believed.value - measured.value) / (2 * SPAN)) * 100}%` }}>
          <em>{believed.value - measured.value} points</em>
        </span>
        <span className={s.gapZero} style={{ left: at(0) }} />
        {GAP.map((g) => (
          <span key={g.label} className={s.gapDot} data-real={g.value < 0 || undefined} data-up={g === GAP[0] || undefined} style={{ left: at(g.value) }}>
            <b>
              {g.value > 0 ? `${g.value}% faster` : `${-g.value}% slower`}
            </b>
            <span>{g.label}</span>
          </span>
        ))}
      </div>
      <div className={s.gapAxis} aria-hidden>
        <span>slower</span>
        <span>same speed</span>
        <span>faster</span>
      </div>
      <table className={s.hidden}>
        <caption>Developer speed with AI tools, METR 2025</caption>
        <tbody>
          {GAP.map((g) => (
            <tr key={g.label}>
              <th scope="row">{g.label}</th>
              <td>{g.value > 0 ? `${g.value}% faster` : `${-g.value}% slower`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption>
        Speed with AI tools against without, for 16 experienced developers on 246 issues in their own repositories.{" "}
        <a href={METR.href}>METR, 2025</a>
      </figcaption>
    </figure>
  );
}
