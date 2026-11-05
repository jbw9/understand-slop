import s from "./landing.module.css";

const MARKS = [
  {
    state: "derived",
    name: "Checked",
    body: "Every sentence on a plain card was checked against the lines it cites. Plain cards carry no badge.",
  },
  {
    state: "partial",
    name: "Partial",
    body: "Found in the code, and known to be incomplete. The card says what is missing.",
  },
  {
    state: "inferred",
    name: "Inferred",
    body: "Not provable from the code, so drawn dashed, the way a map draws a boundary nobody has surveyed.",
  },
];

/** The map's legend: what a plain, an amber and a dashed card mean. */
export function LandingTrust() {
  return (
    <section id="trust" data-trail="What to trust" className={`${s.section} ${s.trust}`} aria-labelledby="trust-title">
      <div>
        <h2 id="trust-title">Solid means checked. Dashed means guessed.</h2>
        <p className={s.intro}>
          A map you can&rsquo;t trust is worse than none. Sentences that fail the check are taken out before you see them,
          and what the map couldn&rsquo;t prove is marked, so you know what to read yourself.
        </p>
      </div>
      <ul className={s.legend}>
        {MARKS.map((m) => (
          <li key={m.state} data-state={m.state}>
            <span className={s.legendCard} aria-hidden>
              <b>Handling Requests</b>
              {m.state === "derived" ? null : <em>{m.state}</em>}
            </span>
            <b>{m.name}</b>
            <p>{m.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
