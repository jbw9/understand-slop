"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import s from "./landing.module.css";

const RAW = "https://raw.githubusercontent.com/jbw9/understand-slop/main";

// Windows has no `sh` to pipe into, so its curl.exe hands the script to PowerShell; this
// line runs the same from cmd, Windows PowerShell and PowerShell 7.
const OSES = [
  { id: "mac", label: "macOS", cmd: `curl -fsSL ${RAW}/install.sh | sh` },
  { id: "linux", label: "Linux", cmd: `curl -fsSL ${RAW}/install.sh | sh` },
  {
    id: "windows",
    label: "Windows",
    cmd: `powershell -ExecutionPolicy Bypass -c "iex (curl.exe -fsSL ${RAW}/install.ps1 | Out-String)"`,
  },
] as const;
type Os = (typeof OSES)[number]["id"];

const detect = (): Os => {
  const ua = navigator.userAgent;
  return /Windows/.test(ua) ? "windows" : /Linux|X11/.test(ua) && !/Android/.test(ua) ? "linux" : "mac";
};

/** The one-line install for the visitor's system, with a tab for each of the others. */
export function LandingInstall() {
  const detected = useSyncExternalStore(
    () => () => {},
    detect,
    () => "mac" as Os,
  );
  const [picked, setPicked] = useState<Os | null>(null);
  const [copied, setCopied] = useState(false);
  const os = OSES.find((o) => o.id === (picked ?? detected))!;

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className={s.install}>
      <div className={s.installBox}>
        <code>
          <span aria-hidden>{os.id === "windows" ? ">" : "$"}</span>
          {os.cmd}
        </code>
        <button
          type="button"
          className={`${s.btn} ${s.primary}`}
          onClick={() => navigator.clipboard.writeText(os.cmd).then(() => setCopied(true))}
        >
          {copied ? "Copied" : "Copy install"}
        </button>
      </div>
      <div className={s.installOs} aria-label="Your system">
        {OSES.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={o.id === os.id}
            onClick={() => {
              setPicked(o.id);
              setCopied(false);
            }}
          >
            {o.label}
          </button>
        ))}
        <span>Paste it in a terminal.</span>
      </div>
    </div>
  );
}
