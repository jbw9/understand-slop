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
      <div className={`${s.story} ${s.reveal}`}>
        <p className={s.intro}>
          Agents now write in minutes what takes hours to read. A small fix comes back touching a dozen files, and the
          mistakes that matter are architectural: they surface months later, when fixing them means understanding a lot of
          code nobody ever read.
        </p>
        <p className={s.intro}>
          The tools we had didn&rsquo;t help much. A terminal shows a wall of text, an agent panel one message at a time,
          an editor one file at a time. Asking an assistant &ldquo;how does this work?&rdquo; answers one question and
          loses the big picture. We wanted to see the whole program first, then go straight to the part that changed.
        </p>
      </div>
      <div className={s.problems}>
        {problems.map((p, i) => (
          <article key={p.title} className={s.reveal} style={{ "--i": i % 2 } as React.CSSProperties}>
            <h3>{p.title}</h3>
            <blockquote>{p.said}</blockquote>
            <cite>
              <a href={p.by.href}>
                {p.by.who}, {p.by.work}
              </a>
            </cite>
            <p className={s.answer}>
              <b>Bluprint</b>
              {p.answer}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
