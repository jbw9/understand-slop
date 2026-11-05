import s from "./v2.module.css";

// The same problem at every size. The first is the page's own voice, said to anyone; the other two are people the team spoke with, by role.
const SCALE: { who: string; line: string; by?: string; to?: string }[] = [
  { who: "Solo developers", line: "You built it in a weekend. I bet you can’t explain how it works.", to: "John Doe, solo developer" },
  { who: "Startups", line: "The agents ship more in a week than the team can review.", by: "CTO, Series B tech startup" },
  {
    who: "Big tech",
    line: "Code review is the new bottleneck. Engineers are drowning in reviews, and some have ten or more changes waiting in their queue.",
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
            {x.by || x.to ? <cite>{x.by ?? x.to}</cite> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
