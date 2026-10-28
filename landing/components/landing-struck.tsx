import s from "./landing.module.css";

export interface Struck {
  repo: string;
  /** The card the sentence was on. */
  where: string;
  claim: string;
  verdict: "contradicted" | "not shown";
  why: string;
}

/** `code` in the checker's prose, set as code. */
const ticks = (text: string) => text.split("`").map((t, i) => (i % 2 ? <code key={i}>{t}</code> : t));

/**
 * Sentences the checker took out of the maps above, struck through, beside
 * its reason. The strike draws as each row scrolls in, where the browser
 * can tie an animation to scrolling; elsewhere it is simply there.
 */
export function LandingStruck({ items, checked, removed }: { items: Struck[]; checked: number; removed: number }) {
  return (
    // [data-chrome] takes the app's dark tokens, so the panel is dark in either theme.
    <section id="checks" className={s.struck} aria-labelledby="struck-title" data-chrome>
      <div className={s.wrap}>
        <p className={`${s.eyebrow} ${s.reveal}`}>What it checks</p>
        <h2 id="struck-title" className={s.reveal}>It crosses out what it can&rsquo;t prove.</h2>
        <p className={`${s.intro} ${s.reveal}`}>
          Every sentence on a map is checked against the lines it cites. These are real sentences the checker removed from
          the maps above, with its reasons.
        </p>
        <p className={s.tally}>
          {checked} cards checked · {removed} claims taken out
        </p>
        <ol className={s.errata}>
          {items.map((it) => (
            <li key={it.repo + it.claim} className={s.reveal} data-verdict={it.verdict === "contradicted" ? "alarm" : "inferred"}>
              <p className={s.where}>
                {it.repo} · {it.where}
              </p>
              <p className={s.claim}>
                <del>{ticks(it.claim)}</del>
              </p>
              <div className={s.why}>
                <span className={s.chip}>{it.verdict}</span>
                <p>{ticks(it.why)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
