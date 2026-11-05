/* eslint-disable @next/next/no-img-element -- the site is a static export, which next/image cannot optimize; these are small dithered PNGs already. */
import { LandingInstall } from "./landing-install";
import s from "./v2.module.css";

// Published under the site's base path, like the demo maps beside it.
const img = (name: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/v2/${name}.png`;

/**
 * The first screen, drawn as a sheet of notes: the claim set in light type
 * with pictures between the words, and down the left a grid with a hand
 * reaching for the first step, as the reader will.
 */
export function LandingCover({ github }: { github: string }) {
  return (
    <section className={s.cover} aria-labelledby="cover-title">
      <div className={s.plate} aria-hidden>
        <div className={s.note}>
          <Rows />
          <p>A map of any repository, drawn from its own code.</p>
          <p>
            &mdash; every sentence <span className={s.ring2}>checked</span> against the lines it cites.
          </p>
        </div>
        <img className={s.hand} src={img("hand")} alt="" />
        <span className={s.lead} />
        <figure className={s.window}>
          <figcaption>
            ENIAC, 1946 <i>×</i>
          </figcaption>
          <img src={img("eniac")} alt="" />
        </figure>
        <Globe />
      </div>

      <div className={s.claim}>
        <h1 id="cover-title" className={s.coverTitle}>
          Understand <Spark /> the code{" "}
          <span className={s.inline} style={{ "--r": "0.8" } as React.CSSProperties}>
            <img src={img("hamilton")} alt="Margaret Hamilton beside the printed source code of the Apollo guidance software" />
          </span>{" "}
          <span className={s.boxed}>
            you didn&rsquo;t write.<small>written by an agent</small>
          </span>
        </h1>
        <p className={s.coverSub}>
          Bluprint splits a repository{" "}
          <span className={s.inline} style={{ "--r": "1.6" } as React.CSSProperties}>
            <img src={img("rope")} alt="" />
          </span>{" "}
          into the steps the program takes. Click a step to open its parts, and keep going{" "}
          <span className={s.inline} style={{ "--r": "0.7" } as React.CSSProperties}>
            <img src={img("microscope")} alt="" />
          </span>{" "}
          until you reach the code.
        </p>
      </div>

      <div className={s.coverFoot}>
        <a className={s.down} href="#app">
          Scroll to open the app <span aria-hidden>↓</span>
        </a>
        <div className={s.card}>
          <p className={s.cardHead}>
            In one line <Spark />
          </p>
          <LandingInstall />
          <p className={s.cardNote}>
            Builds Bluprint from source and works through your own Claude Code. <a href={github}>Source on GitHub</a>.
          </p>
        </div>
      </div>
    </section>
  );
}

/** The four-pointed star the sheet uses as its mark. */
function Spark() {
  return (
    <svg className={s.spark} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 0C12.9 7.6 16.4 11.1 24 12C16.4 12.9 12.9 16.4 12 24C11.1 16.4 7.6 12.9 0 12C7.6 11.1 11.1 7.6 12 0Z" />
    </svg>
  );
}

/** A map's steps, small: one picked. */
function Rows() {
  return (
    <svg className={s.rows} viewBox="0 0 104 22" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={i * 21 + 0.5} y={0.5} width={19} height={9} className={i === 1 ? s.fill : undefined} />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={i * 21 + 0.5} y={12.5} width={19} height={9} className={i === 3 ? s.fill : undefined} />
      ))}
    </svg>
  );
}

function Globe() {
  return (
    <svg className={s.globe} viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="48" />
      <ellipse cx="50" cy="50" rx="20" ry="48" />
      <ellipse cx="50" cy="50" rx="38" ry="48" />
      <path d="M2 50H98M8 28H92M8 72H92" />
    </svg>
  );
}
