"use client";

import { useEffect } from "react";

// The admin dashboard's Supabase project (admin/supabase.sql); the key is the public one.
const SUPABASE_URL = "https://jbvkjvdthuzofvmhwctv.supabase.co";
const SUPABASE_KEY = "sb_publishable_hbxcjbYF5H8py5gGLokxPg_tD9nGsNl";

/**
 * Counts a visit for the admin dashboard: one anonymous id per browser,
 * where it came from, and the country its IP is in (geojs.io, looked up
 * once a day). Renders nothing.
 */
export function LandingVisit() {
  useEffect(() => {
    const stored = (k: string) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    };
    const keep = (k: string, v: string) => {
      try {
        localStorage.setItem(k, v);
      } catch {}
    };
    let vid = stored("bp-visitor");
    if (!vid) keep("bp-visitor", (vid = crypto.randomUUID()));
    const day = new Date().toISOString().slice(0, 10);
    const geo = stored("bp-geo");
    const country: Promise<string | null> =
      geo?.startsWith(day + " ")
        ? Promise.resolve(geo.slice(11) || null)
        : fetch("https://get.geojs.io/v1/ip/country.json")
            .then((r) => r.json())
            .then((g: { name?: string }) => {
              keep("bp-geo", `${day} ${g.name ?? ""}`);
              return g.name ?? null;
            })
            .catch(() => null);
    const referrer = document.referrer && new URL(document.referrer).host !== location.host ? new URL(document.referrer).host : null;
    void country.then((c) =>
      fetch(`${SUPABASE_URL}/rest/v1/rpc/bp_track_visit`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ vid, path: location.pathname, referrer, country: c }),
        keepalive: true,
      }).catch(() => {}),
    );
  }, []);
  return null;
}
