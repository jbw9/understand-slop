/* eslint-disable @next/next/no-img-element -- the site is a static export, which next/image cannot optimize; these are small dithered PNGs already. */
import s from "./v2.module.css";

const img = (name: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/v2/${name}.png`;

type Era = { year: string; who: string; text: string; pic?: string; alt?: string; draw?: "suggest" | "agent" | "map" };

// Each line says only what happened; the pictures are public domain (credited in the footer).
const ERAS: Era[] = [
  {
    year: "1843",
    who: "Ada Lovelace",
    text: "writes out the steps for Babbage’s Analytical Engine to work out Bernoulli numbers, often called the first program.",
    pic: "tl-ada",
    alt: "Portrait of Ada Lovelace",
  },
  {
    year: "1936",
    who: "Alan Turing",
    text: "describes a machine that can carry out any computation that can be written down as steps.",
    pic: "tl-turing",
    alt: "Alan Turing",
  },
  {
    year: "1946",
    who: "ENIAC",
    text: "is programmed by hand: cables plugged in and switches set, one connection at a time.",
    pic: "tl-eniac",
    alt: "A programmer setting up ENIAC",
  },
  {
    year: "1952",
    who: "Grace Hopper",
    text: "builds A-0, one of the first compilers: a program that turns other programs into machine code.",
    pic: "tl-hopper",
    alt: "Grace Hopper in uniform",
  },
  {
    year: "1969",
    who: "Margaret Hamilton",
    text: "leads the team writing Apollo’s on-board flight software. It is printed out, and people read it.",
    pic: "tl-hamilton",
    alt: "Margaret Hamilton beside the printed Apollo source code",
  },
  {
    year: "2021",
    who: "Autocomplete",
    text: "AI starts suggesting the next line as you type. You still read each one before you take it.",
    draw: "suggest",
  },
  {
    year: "Now",
    who: "You, vibecoding",
    text: "An agent writes a feature in minutes, across a dozen files. Reading it takes hours, so nobody does.",
    draw: "agent",
  },
  {
    year: "Next",
    who: "Bluprint",
    text: "draws a map of what it wrote: the steps first, then down to the line.",
    draw: "map",
  },
];

/**
 * How code went from written by hand to written for us, one figure per era.
 * The page's scroll pans the row sideways while the section holds still;
 * where the browser can't tie motion to scroll, the row scrolls on its own.
 */
export function LandingEvolution() {
  return (
    <section className={s.evo} aria-labelledby="evo-title">
      <div className={s.evoStick}>
        <header className={s.evoHead}>
          <p className={s.bracket}>[ How we got here ]</p>
          <h2 id="evo-title">From code we wrote by hand to code nobody reads.</h2>
        </header>
        <div className={s.evoView}>
          <ol className={s.evoTrack}>
            {ERAS.map((e, i) => (
              <li key={e.year} data-last={i === ERAS.length - 1 || undefined}>
                <figure>
                  <figcaption>
                    <span>Fig. {i + 1}</span>
                    <span>{e.who}</span>
                  </figcaption>
                  {e.pic ? <img src={img(e.pic)} alt={e.alt} loading="lazy" /> : <Drawn kind={e.draw!} />}
                </figure>
                <b className={s.year}>{e.year}</b>
                <p>
                  {e.year === "2021" || e.year === "Now" ? null : <strong>{e.who} </strong>}
                  {e.text}
                </p>
                {e.draw === "map" ? (
                  <a className={s.evoGo} href="#app">
                    Open it below <span aria-hidden>↓</span>
                  </a>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
        <div className={s.evoRule} aria-hidden>
          <span />
        </div>
      </div>
    </section>
  );
}

/** The eras with no photograph, drawn in the same ink. */
function Drawn({ kind }: { kind: "suggest" | "agent" | "map" }) {
  if (kind === "suggest")
    return (
      <svg className={s.evoDraw} viewBox="0 0 200 250" aria-hidden>
        {[40, 58, 76, 94, 112].map((y, i) => (
          <path key={y} d={`M${24 + (i % 2) * 14} ${y}H${150 - i * 12}`} />
        ))}
        <path d="M38 130H168" className={s.ghost} />
        <path d="M38 148H132" className={s.ghost} />
        <rect x="140" y="170" width="36" height="22" rx="3" />
        <text x="158" y="185">tab</text>
        <path d="M37 122V138" className={s.caret} />
      </svg>
    );
  if (kind === "agent")
    return (
      <svg className={s.evoDraw} viewBox="0 0 200 250" aria-hidden>
        <rect x="14" y="20" width="172" height="210" />
        <path d="M14 38H186" />
        <text x="24" y="58" className={s.left}>&gt; build the settings page</text>
        {Array.from({ length: 12 }, (_, i) => (
          <g key={i}>
            <text x="24" y={80 + i * 12} className={s.small}>edited</text>
            <path d={`M56 ${77 + i * 12}H${70 + ((i * 37) % 100)}`} />
          </g>
        ))}
        <text x="24" y="222" className={s.left}>14 files changed</text>
      </svg>
    );
  return (
    <svg className={s.evoDraw} viewBox="0 0 200 250" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={18} y={40 + i * 28} width={56} height={18} className={i === 2 ? s.fill : undefined} />
      ))}
      <path d="M74 105H96M96 76V160" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <path d={`M96 ${80 + i * 38}H106`} />
          <rect x={106} y={71 + i * 38} width={46} height={18} className={i === 1 ? s.fill : undefined} />
        </g>
      ))}
      <path d="M152 118H164" />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M166 ${104 + i * 7}H${190 - (i % 3) * 7}`} />
      ))}
    </svg>
  );
}
