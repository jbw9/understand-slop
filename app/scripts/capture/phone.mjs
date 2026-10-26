// Real screenshots of explorify for `screen` blocks (D37).
//
// Drives the app's own web build in a headless phone-sized Chrome. Every
// request to Supabase is answered from sample data in fixtures.mjs — nothing
// reaches the real project — and three web-only gaps are bridged in the served
// bundle (see the Fetch.requestPaused handler). explorify's files are not edited.
//
// Needs Expo web running:  cd ~/Desktop/Code/explorify && CI=1 npx expo start --web --port 8099
// usage (from app/):        node scripts/capture/phone.mjs public/shots/explorify <none|student|org> <route> step...
//   steps: shot:name | tap:<exact text> | type:<placeholder>=<value> | wait:ms | eval:js | scroll:y
//   Students and organisations should start at "/" and let the app route them;
//   a shot is saved as <outdir>/<name>.png at 390x844 @2x.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { respond, seedData, seedSrc } from "./fixtures.mjs";

const [out, role, route, ...steps] = process.argv.slice(2);
const port = 9340 + Math.floor(Math.random() * 50);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${os.tmpdir()}/slop-capture-${port}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ver; for (let i = 0; i < 60; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(ver.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map(); const log = [];
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
ws.addEventListener("message", async (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
  if (d.method === "Fetch.requestPaused" && d.params.responseStatusCode !== undefined) {
    // The app bundle from Expo. One native-only call (Appearance.setColorScheme,
    // which forces light mode on the phone) does not exist on react-native-web;
    // made a no-op here so the real screens render. explorify is not edited.
    const { requestId } = d.params;
    const b = await send("Fetch.getResponseBody", { requestId });
    let text = b.result.base64Encoded ? Buffer.from(b.result.body, "base64").toString() : b.result.body;
    text = text.replace(/(_Appearance\.default)\.setColorScheme\(/g, "($1.setColorScheme || function () {})(");
    // NativeWind v2 emits CSS classes on web by default, which needs a Tailwind
    // stylesheet this project never builds; "native" output styles the web
    // build exactly as it styles the phone (NativeWind's documented switch).
    // react-native-svg's web build has no SvgXml; the app draws most icons
    // with it. Same markup, drawn inline (globalThis.__SvgXml, see below).
    text = text.replace(/_reactNativeSvg\.SvgXml\b/g, "globalThis.__SvgXml");
    if (process.env.DIAG) text = text.replace(/\(0, _jsxDevRuntime\.jsxDEV\)\(([\w$.]+), /g, (m, t) => `(0, _jsxDevRuntime.jsxDEV)((${t} === undefined && console.warn("UNDEF ${t}"), ${t}), `);
    text = text.replace(/_nativewind\.NativeWindStyleSheet\.create\(/g, '(_nativewind.NativeWindStyleSheet.setOutput({ default: "native" }), _nativewind.NativeWindStyleSheet).create(');
    send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/javascript" }], body: Buffer.from(text).toString("base64") });
    return;
  }
  if (d.method === "Fetch.requestPaused") {
    const { requestId, request } = d.params;
    const r = respond(role, request.method, request.url, request.postData, request.headers);
    log.push(`${request.method} ${new URL(request.url).pathname}${new URL(request.url).search.slice(0, 90)} -> ${r.status}`);
    const headers = [
      { name: "Content-Type", value: r.type ?? "application/json" },
      { name: "Access-Control-Allow-Origin", value: "*" },
      { name: "Access-Control-Allow-Headers", value: "*" },
      { name: "Access-Control-Allow-Methods", value: "*" },
      { name: "Access-Control-Expose-Headers", value: "*" },
    ];
    send("Fetch.fulfillRequest", { requestId, responseCode: r.status, responseHeaders: headers, body: Buffer.from(r.body ?? "").toString("base64") });
  }
  if (d.method === "Runtime.consoleAPICalled" && ["error", "warn"].includes(d.params.type))
    log.push(`console.${d.params.type}: ${d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 600)}`);
  if (d.method === "Runtime.exceptionThrown") log.push(`EXC ${d.params.exceptionDetails.exception?.description?.split("\n")[0]}`);
});
await send("Runtime.enable");
await send("Page.enable");
await send("Fetch.enable", { patterns: [{ urlPattern: "*supabase.co*" }, { urlPattern: "*entry.bundle*", requestStage: "Response" }] });
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true });
await send("Browser.grantPermissions", { permissions: ["geolocation"], origin: "http://localhost:8099" });
// The middle of the UIUC quad, so the GPS lookup picks that campus.
await send("Emulation.setGeolocationOverride", { latitude: 40.1075, longitude: -88.2272, accuracy: 10 });
// A plain React element built by hand: this script runs before React loads.
await send("Page.addScriptToEvaluateOnNewDocument", { source: `globalThis.__SvgXml = function (p) {
  var xml = String(p.xml || "");
  var w = p.width == null ? "100%" : p.width, h = p.height == null ? "100%" : p.height;
  xml = xml.replace(/<svg([^>]*)>/, function (m, a) { a = a.replace(/\\s(width|height)="[^"]*"/g, ""); return "<svg" + a + ' width="' + w + '" height="' + h + '"' + (p.fill ? ' fill="' + p.fill + '"' : "") + ">"; });
  if (p.color) xml = xml.replace(/currentColor/g, p.color);
  return { $$typeof: Symbol.for("react.element"), type: "span", key: null, ref: null, _owner: null, _store: { validated: true },
    props: { style: Object.assign({ display: "inline-flex", width: typeof w === "number" ? w + "px" : w, height: typeof h === "number" ? h + "px" : h }, Array.isArray(p.style) ? Object.assign.apply(null, [{}].concat(p.style)) : p.style || {}), dangerouslySetInnerHTML: { __html: xml } } };
};` });
await send("Page.addScriptToEvaluateOnNewDocument", { source: `(${seedSrc})(${JSON.stringify(role)}, ${JSON.stringify(seedData(role))})` });
await send("Page.navigate", { url: "http://localhost:8099" + route });
await sleep(6000);

const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
// Click the innermost visible element whose own text matches.
const tapJs = (text) => `(() => { const els = [...document.querySelectorAll("body *")].filter(e => e.offsetParent !== null && e.textContent.trim() === ${JSON.stringify(text)}); const el = els.pop(); if (!el) return "MISSING"; let t = el; while (t && !(t.getAttribute("role") === "button" || t.tabIndex >= 0 || t.onclick) && t.parentElement) t = t.parentElement; (t || el).click(); return "ok"; })()`;
for (const s of steps) {
  const [k, ...rest] = s.split(":"); const v = rest.join(":");
  if (k === "shot") { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(`${out}/${v}.png`, Buffer.from(r.result.data, "base64")); console.log("shot", v); }
  else if (k === "tap") { console.log("tap", v, await ev(tapJs(v))); await sleep(1500); }
  else if (k === "type") {
    const [ph, val] = v.split("=");
    const r = await ev(`(() => { const i = [...document.querySelectorAll("input,textarea")].find(e => (e.placeholder||"").includes(${JSON.stringify(ph)})); if (!i) return "MISSING"; i.focus(); return "ok"; })()`);
    if (r === "ok") await send("Input.insertText", { text: val });
    console.log("type", ph, r); await sleep(400);
  }
  else if (k === "wait") await sleep(+v);
  else if (k === "scroll") { await ev(`(() => { const s = [...document.querySelectorAll("div")].filter(d => d.scrollHeight > d.clientHeight + 20 && getComputedStyle(d).overflowY !== "visible").pop(); (s||document.scrollingElement).scrollTop = ${+v}; })()`); await sleep(600); }
  else if (k === "eval") console.log("eval", await ev(v));
}
fs.writeFileSync(`${os.tmpdir()}/slop-capture.log`, log.join("\n"));
console.log(`log: ${os.tmpdir()}/slop-capture.log`);
chrome.kill(); process.exit(0);
