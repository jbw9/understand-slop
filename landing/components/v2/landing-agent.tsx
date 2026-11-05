"use client";

import { useEffect, useRef, useState } from "react";
import { Drawn } from "./landing-features";
import s from "./v2.module.css";

/**
 * The app beside the agent writing the code: a part picked on the map goes
 * into Claude's next prompt, and after the edit the map marks what changed.
 * Drawn from the app's own pieces (landing-features.tsx), and played once it
 * scrolls into view, so it starts where the reader can see it.
 */
export function LandingAgent() {
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const watch = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold: 0.4 });
    watch.observe(box.current!);
    return () => watch.disconnect();
  }, []);

  return (
    <section id="agent" className={s.section} aria-labelledby="agent-title">
      <div className={`${s.wrap} ${s.agent}`}>
        <div className={s.reveal}>
          <p className={s.eyebrow}>Beside your agent</p>
          <h2 id="agent-title">Keep up with your agent.</h2>
          <p className={s.intro}>
            Claude Code, Codex and OpenCode open in tabs beside the map. Right-click a part to add it to Claude&rsquo;s
            context, so you can ask about the part you&rsquo;re looking at.
          </p>
          <p className={s.intro}>
            When an agent edits the code, the map marks the parts whose code changed, and dashes the ones that call into
            them.
          </p>
        </div>
        <div ref={box} className={`${s.agentFrame} ${s.reveal}`}>
          {seen ? <Drawn drawing="agent" /> : null}
        </div>
      </div>
    </section>
  );
}
