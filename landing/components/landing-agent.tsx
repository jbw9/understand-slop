import s from "./landing.module.css";

/**
 * The app beside the agent writing the code: a pick on the map goes into
 * Claude's next prompt, and after an edit the map redoes the sections it
 * touched. Drawn, not live: the frame above has no agent in it.
 */
export function LandingAgent({ name, sections, changed }: { name: string; sections: string[]; changed: string }) {
  return (
    <section id="agent" className={`${s.section} ${s.agent}`} aria-labelledby="agent-title">
      <div className={s.reveal}>
        <p className={s.eyebrow}>Beside your agent</p>
        <h2 id="agent-title">Keep up with your agent.</h2>
        <p className={s.intro}>
          Claude Code, Codex and OpenCode open in tabs beside the map. Pick a section and it goes into Claude&rsquo;s
          next prompt, so you can ask about the part you&rsquo;re looking at.
        </p>
        <p className={s.intro}>
          When an agent edits the code, the map redoes only the sections it touched, and marks which ones changed.
        </p>
      </div>
      <div aria-hidden className={`${s.frame} ${s.desk} ${s.reveal}`}>
        <div className={s.term}>
          <div className={s.termTabs}>
            <b>Claude Code</b>
            <span>Codex</span>
          </div>
          <pre>
            <span className={s.picked}>[Map section: {changed}]</span>
            {"\n"}
            <span className={s.prompt}>&gt;</span> return JSON from the 404 handler{"\n\n"}
            <span className={s.faintText}>Edited src/flask/app.py</span>
          </pre>
        </div>
        <div className={s.mini}>
          <p className={s.winName}>{name}</p>
          <ol>
            {sections.map((t, i) => (
              <li key={t} data-changed={t === changed || undefined}>
                <span className={s.n}>{i + 1}</span>
                {t}
                {t === changed ? <em>changed</em> : null}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
