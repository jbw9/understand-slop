import s from "./v2.module.css";

export interface Source {
  who: string;
  work: string;
  href: string;
}

export interface Problem {
  title: string;
  said: React.ReactNode;
  by: Source;
  answer: string;
}

// The same problem at every size, said in the page's own voice: no one is quoted here.
const SCALE = [
  { who: "On your own", line: "You built it in a weekend. I bet you can’t explain how it works." },
  { who: "At a startup", line: "The agents ship more in a week than the team can review." },
  { who: "At a big company", line: "Every team adds agent-written code to a codebase nobody has read end to end." },
];

/** Why Bluprint exists: what developers say goes wrong with agent-written code, each next to what the app does about it. */
export function LandingWhy({ problems }: { problems: Problem[] }) {
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
            <p>{x.line}</p>
          </li>
        ))}
      </ul>
      <div className={s.problems}>
        {problems.map((p, i) => (
          <article key={p.title} className={s.reveal} style={{ "--i": i } as React.CSSProperties}>
            <h3>{p.title}</h3>
            <blockquote>{p.said}</blockquote>
            <cite>
              <a href={p.by.href}>{p.by.who}</a>
            </cite>
            <p className={s.answer}>{p.answer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
