"use client";

import { useEffect, useState } from "react";
import s from "./landing.module.css";

const CMD = "curl -fsSL https://raw.githubusercontent.com/jbw9/bluprint/main/install.sh | sh";

/** The one-line install, the same on macOS and Linux, with a button that copies it. */
export function LandingInstall() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className={s.install}>
      <div className={s.installBox}>
        <code>
          <span aria-hidden>$</span>
          {CMD}
        </code>
        <button
          type="button"
          className={`${s.btn} ${s.primary}`}
          onClick={() => navigator.clipboard.writeText(CMD).then(() => setCopied(true))}
        >
          {copied ? "Copied" : "Copy install"}
        </button>
      </div>
      <div className={s.installOs}>Paste it in a terminal on macOS or Linux.</div>
    </div>
  );
}
