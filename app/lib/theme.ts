/**
 * What app/layout.tsx needs to set the theme before first paint. Kept apart
 * from lib/settings.ts, which uses React hooks and so cannot be imported by a
 * server component.
 */

export const SETTINGS_KEY = "slop.settings";
export const THEMES = ["classic", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** A saved theme, or Classic for none and for one this version no longer has. */
export const themeOf = (t: unknown): Theme => (THEMES.includes(t as Theme) ? (t as Theme) : "classic");

/** applyTheme (lib/settings.ts) as an inline script, so the page never flashes another theme. */
export const THEME_SCRIPT = `try{var t=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})||"{}").theme;document.documentElement.dataset.theme=${JSON.stringify(THEMES)}.indexOf(t)<0?"classic":t}catch(e){document.documentElement.dataset.theme="classic"}`;
