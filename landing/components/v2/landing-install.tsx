"use client";

import { useEffect, useState } from "react";
import s from "./v2.module.css";

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
          className={`${s.btn} ${s.primary} ${s.copy}`}
          aria-label={copied ? "Copied" : "Copy install command"}
          title={copied ? "Copied" : "Copy"}
          onClick={() => navigator.clipboard.writeText(CMD).then(() => setCopied(true))}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            {copied ? (
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            ) : (
              <>
                <rect x="8" y="3" width="8" height="4" rx="1" />
                <path d="M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2" />
              </>
            )}
          </svg>
        </button>
      </div>
      <div className={s.installOs}>Paste it in a terminal on macOS or Linux.</div>
    </div>
  );
}
