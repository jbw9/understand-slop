/**
 * What app/layout.tsx needs to set the theme before first paint. Kept apart
 * from lib/settings.ts, which uses React hooks and so cannot be imported by a
 * server component.
 */

export const SETTINGS_KEY = "slop.settings";
export const DARK = "(prefers-color-scheme: dark)";

/** applyTheme (lib/settings.ts) as an inline script: Settings' choice, else the system's. */
export const THEME_SCRIPT = `try{var t=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})||"{}").theme;var d=t==="dark"||(t!=="light"&&matchMedia(${JSON.stringify(DARK)}).matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}`;
