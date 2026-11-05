import s from "./v2.module.css";

// The same problem at every size. The first is the page's own voice; the other two are people the team spoke with, by role.
const SCALE: { who: string; line: string; by?: string }[] = [
  { who: "On your own", line: "You built it in a weekend. I bet you can’t explain how it works." },
  { who: "At a startup", line: "The agents ship more in a week than the team can review.", by: "CTO, Series B tech startup" },
  {
    who: "At a big company",
    line: "Every team adds agent-written code to a codebase nobody has read end to end.",
    by: "SDM at Amazon",
  },
];
/** Why Bluprint exists: the same problem, from one person to a big company. */
export function LandingWhy() {
  return (
    <section id="why" className={s.section} aria-labelledby="why-title">
      <p className={`${s.eyebrow} ${s.reveal}`}>Why we&rsquo;re building this</p>
      <h2 id="why-title" className={s.reveal}>
        Code got cheap. Understanding didn&rsquo;t.
      </h2>
      <ul className={s.scale}>
        {SCALE.map((x, i) => (
          <li key={x.who} className={s.reveal} style={{ "--i": i } as React.CSSProperties}>
            <span>{x.who}</span>
            <p>{x.by ? <>&ldquo;{x.line}&rdquo;</> : x.line}</p>
            {x.by ? <cite>{x.by}</cite> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
