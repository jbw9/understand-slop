"use client";

import { useState } from "react";
import s from "./landing.module.css";

/** The page ends where the map does: on one line of code, numbered, with a button that copies it. */
export function LandingLine({ line }: { line: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={s.line}>
      <i aria-hidden>1</i>
      <code>{line}</code>
      <button
        onClick={() =>
          navigator.clipboard.writeText(line).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          })
        }
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
