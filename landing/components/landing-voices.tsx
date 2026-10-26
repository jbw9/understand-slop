"use client";

import { useEffect, useState } from "react";
import s from "./landing.module.css";

export interface Voice {
  who: string;
  role: string;
  quote: string;
}

const DUR = 2670;

/** One big quote at a time, with a bar per quote that fills while it shows. */
export function LandingVoices({ voices }: { voices: Voice[] }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setShown((n) => n + 1), DUR);
    return () => clearInterval(t);
  }, []);
  const at = shown % voices.length;

  return (
    <section
      className={s.voices}
      aria-roledescription="carousel"
      aria-label="What developers say"
      style={{ "--n": voices.length, "--dur": `${DUR}ms` } as React.CSSProperties}
    >
      <div className={s.voiceStage}>
        {voices.map((v, i) => (
          <figure key={v.who} className={s.slide} data-on={i === at} aria-hidden={i !== at}>
            <blockquote>{v.quote}</blockquote>
            <figcaption>
              <b>{v.who}</b>
              {v.role}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className={s.progress} aria-hidden>
        {voices.map((v, i) => (
          // A new key each time a quote comes round restarts its bar.
          <span key={i === at ? `now-${shown}` : v.who} data-done={i < at} data-now={i === at} />
        ))}
      </div>
    </section>
  );
}
