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

/** Why Bluprint exists: what developers say goes wrong with agent-written code, each next to what the app does about it. */
export function LandingWhy({ problems }: { problems: Problem[] }) {
  return (
    <section id="why" className={s.section} aria-labelledby="why-title">
      <p className={`${s.eyebrow} ${s.reveal}`}>Why we&rsquo;re building this</p>
      <h2 id="why-title" className={s.reveal}>
        Code got cheap. Understanding didn&rsquo;t.
      </h2>
      <p className={`${s.intro} ${s.reveal}`}>
        Agents write in minutes what takes hours to read, and the tools we had show one file, one message, one wall of
        text at a time. We wanted to see the whole program first, then go straight to the part that changed.
      </p>
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
