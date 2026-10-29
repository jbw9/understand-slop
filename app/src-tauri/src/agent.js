// Mira's preview agent (src-tauri/src/preview.rs puts it in every
// page the preview frames). It answers the window around the frame
// (components/preview.tsx): reads the page, and clicks, types and scrolls in it
// the way a person would, for the user's tools and for Claude's, and draws
// Claude's pointer where it acts. It does nothing in a page that is not framed.
//
// A page from the web is not framed but has a webview of its own
// (src-tauri/src/browser.rs), where this runs wrapped with SLOP_NATIVE set: it
// keeps what it has to say until the tab collects it, through window.__slop.
(() => {
  const native = typeof SLOP_NATIVE !== "undefined";
  if (window.__slopAgent || (!native && window.parent === window)) return;
  window.__slopAgent = true;
  let outbox = [];
  const post = (m) => {
    if (native) {
      outbox.push(m);
      // Nobody collecting (the tab closed): the oldest give way.
      if (outbox.length > 2000) outbox = outbox.slice(-1000);
      return;
    }
    try {
      window.parent.postMessage({ __slop: true, ...m }, "*");
    } catch {}
  };

  /* ── what the page says: its console, its errors, where it is ── */

  const show = (v) => {
    if (typeof v === "string") return v;
    if (v instanceof Error) return v.stack || String(v);
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  };
  for (const level of ["log", "info", "warn", "error", "debug"]) {
    const own = console[level];
    console[level] = function (...args) {
      post({ type: "console", level, text: args.map(show).join(" ").slice(0, 4000) });
      return own.apply(this, args);
    };
  }
  addEventListener("error", (e) => post({ type: "console", level: "error", text: `${e.message} (${e.filename}:${e.lineno})` }));
  addEventListener("unhandledrejection", (e) => post({ type: "console", level: "error", text: `Unhandled rejection: ${show(e.reason)}` }));

  // The app's webviews show no dialogs (wry has none): an alert passed
  // unseen and a confirm always said no, so nothing behind one could be done.
  // Each is answered OK here instead, and said in the console.
  const dialog = (kind, message, answer) => post({ type: "console", level: "dialog", text: `${kind}(${JSON.stringify(String(message ?? ""))}) → ${answer}` });
  window.alert = (message) => dialog("alert", message, "OK");
  window.confirm = (message) => (dialog("confirm", message, "OK"), true);
  window.prompt = (message, value) => {
    const answer = value == null ? "" : String(value);
    dialog("prompt", message, JSON.stringify(answer));
    return answer;
  };

  // Claude's right-click where the page has no menu of its own would open
  // WebKit's, which Claude can neither see nor use, so it is kept closed. On
  // the window, and added first, so the page's own listeners have been heard.
  let menuFor = 0;
  let pageMenu = false;
  addEventListener("contextmenu", (e) => {
    if (performance.now() - menuFor > 2000) return;
    menuFor = 0;
    pageMenu = e.defaultPrevented;
    e.preventDefault();
  });

  const where = () => post({ type: "location", url: location.href, title: document.title });
  for (const k of ["pushState", "replaceState"]) {
    const own = history[k];
    history[k] = function (...args) {
      const r = own.apply(this, args);
      where();
      return r;
    };
  }
  addEventListener("popstate", where);
  addEventListener("hashchange", where);
  addEventListener("DOMContentLoaded", where);
  addEventListener("load", where);
  where();

  /* ── refs: names for elements, handed out by read_page and find ── */

  const refs = new Map();
  let nextRef = 1;
  const refOf = (el) => {
    if (!el.__slopRef) {
      el.__slopRef = `ref_${nextRef++}`;
      refs.set(el.__slopRef, new WeakRef(el));
    }
    return el.__slopRef;
  };
  const byRef = (ref) => {
    const el = refs.get(ref)?.deref();
    if (!el || !el.isConnected) throw new Error(`${ref} is gone from the page; read_page again.`);
    return el;
  };

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const ROLES = {
    A: "link",
    BUTTON: "button",
    SELECT: "combobox",
    TEXTAREA: "textbox",
    SUMMARY: "button",
    H1: "heading",
    H2: "heading",
    H3: "heading",
    H4: "heading",
    H5: "heading",
    H6: "heading",
    IMG: "img",
    NAV: "navigation",
    MAIN: "main",
    HEADER: "banner",
    FOOTER: "contentinfo",
    FORM: "form",
    DIALOG: "dialog",
    UL: "list",
    OL: "list",
    LI: "listitem",
    TABLE: "table",
    LABEL: "label",
  };
  const roleOf = (el) => {
    const r = el.getAttribute("role");
    if (r) return r;
    if (el.tagName === "INPUT") {
      const t = (el.type || "text").toLowerCase();
      return { checkbox: "checkbox", radio: "radio", button: "button", submit: "button", reset: "button", range: "slider", search: "searchbox", file: "button", color: "button" }[t] || "textbox";
    }
    if (el.isContentEditable && el.hasAttribute("contenteditable")) return "textbox";
    if (el.tagName === "A" && !el.hasAttribute("href")) return null;
    return ROLES[el.tagName] || null;
  };
  const INTERACTIVE = new Set(["link", "button", "textbox", "searchbox", "combobox", "checkbox", "radio", "slider", "switch", "tab", "menuitem", "option"]);
  const interactive = (el, role) =>
    INTERACTIVE.has(role) ||
    el.isContentEditable ||
    el.hasAttribute("onclick") ||
    (el.tabIndex >= 0 && el.hasAttribute("tabindex")) ||
    getComputedStyle(el).cursor === "pointer";
  const clip = (s, n = 80) => {
    s = (s || "").replace(/\s+/g, " ").trim();
    return s.length > n ? `${s.slice(0, n)}…` : s;
  };
  const nameOf = (el) => {
    const label =
      el.getAttribute("aria-label") ||
      (el.getAttribute("aria-labelledby") &&
        el
          .getAttribute("aria-labelledby")
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent || "")
          .join(" ")) ||
      (el.labels && el.labels[0]?.textContent) ||
      el.getAttribute("alt") ||
      el.getAttribute("title") ||
      el.getAttribute("placeholder");
    if (label) return clip(label);
    if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return "";
    return clip(el.innerText || el.textContent);
  };

  const optionsOf = (select) =>
    JSON.stringify([...select.options].slice(0, 40).map((o) => clip(o.text, 40)));

  /** The page as a tree of what matters, one element per line. */
  const readPage = ({ filter = "all", ref } = {}) => {
    const lines = [];
    const root = ref ? byRef(ref) : document.body;
    const walk = (el, depth) => {
      if (lines.length > 1500 || !(el instanceof Element)) return;
      if (el.getAttribute("aria-hidden") === "true" || ["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(el.tagName)) return;
      if (!visible(el) && el !== document.body) return;
      const role = roleOf(el);
      const act = interactive(el, role);
      const keep = filter === "interactive" ? act : act || role;
      let next = depth;
      if (keep) {
        let line = `${"  ".repeat(depth)}- ${role || (el.isContentEditable ? "textbox" : "generic")}`;
        const name = nameOf(el);
        if (name) line += ` "${name}"`;
        if (/^H[1-6]$/.test(el.tagName)) line += ` level=${el.tagName[1]}`;
        if (el.tagName === "A" && el.getAttribute("href")) line += ` href="${clip(el.getAttribute("href"), 60)}"`;
        if ("value" in el && !["BUTTON", "LI"].includes(el.tagName) && !["checkbox", "radio", "password"].includes(el.type) && el.value !== undefined && el.value !== "")
          line += ` value="${clip(String(el.value), 60)}"`;
        if (el.tagName === "SELECT") line += ` options=${optionsOf(el)}`;
        if (el.type === "file") line += " file picker";
        if (el.type === "checkbox" || el.type === "radio") line += el.checked ? " checked" : " unchecked";
        if (el.disabled) line += " disabled";
        if (act) line += ` [${refOf(el)}]`;
        lines.push(line);
        next = depth + 1;
        // A control's own children are its label, already said.
        if (act && role !== "generic" && role !== "list" && role !== "form") return;
      } else if (filter === "all" && el.children.length === 0) {
        const text = clip(el.textContent, 120);
        if (text) lines.push(`${"  ".repeat(depth)}- text "${text}"`);
        return;
      }
      for (const c of el.children) walk(c, next);
      if (el.shadowRoot) for (const c of el.shadowRoot.children) walk(c, next);
    };
    walk(root, 0);
    if (lines.length > 1500) lines.push("… (cut short: pass ref to read part of the page, or filter: interactive)");
    return `${document.title ? `Title: ${document.title}\n` : ""}URL: ${location.href}\n\n${lines.join("\n")}`;
  };

  const find = ({ query }) => {
    let found = [];
    try {
      found = [...document.querySelectorAll(query)];
    } catch {
      /* not a selector: looked for as text below */
    }
    // A word like "Submit" is a valid selector too; matching nothing, it is text.
    if (!found.length) {
      const q = query.toLowerCase();
      for (const el of document.body.querySelectorAll("*")) {
        if (!visible(el)) continue;
        const role = roleOf(el);
        if (!role && !interactive(el, role)) continue;
        if (nameOf(el).toLowerCase().includes(q)) found.push(el);
      }
    }
    found = found.filter(visible).slice(0, 20);
    if (!found.length) return `Nothing on the page matches "${query}".`;
    return found
      .map((el) => {
        const { x, y } = spot(el);
        return `- ${roleOf(el) || el.tagName.toLowerCase()} "${nameOf(el)}" [${refOf(el)}] at (${Math.round(x)}, ${Math.round(y)})`;
      })
      .join("\n");
  };

  /* ── Claude's pointer ────────────────────────────────────────── */

  // Made the first time Claude acts, so a page that renders itself into the
  // whole document has finished before anything is added to it. In the top
  // layer, over the page's own dialogs, and never in the way of a click.
  let pointer = null;
  let fade = 0;
  const ARROW =
    '<svg width="22" height="24" viewBox="0 0 22 24"><path d="M2 1.5 2 19.5 7 15 10.5 22.5 13.6 21 10.2 13.8 17 13.8Z" fill="#d97757" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const draw = () => {
    if (pointer?.host.isConnected) return pointer;
    const host = document.createElement("slop-pointer");
    host.setAttribute("popover", "manual");
    host.style.cssText =
      "all:initial;position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;z-index:2147483647";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>
      .p{position:fixed;left:-2px;top:-1px;opacity:0;transition:transform .35s cubic-bezier(.3,.7,.25,1),opacity .25s;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}
      .t{position:absolute;left:18px;top:20px;padding:2px 6px;border-radius:5px;background:#d97757;color:#fff;font:600 11px/1.3 -apple-system,system-ui,sans-serif;white-space:nowrap}
      .r{position:fixed;left:-14px;top:-14px;width:24px;height:24px;border:2px solid #d97757;border-radius:50%;opacity:0}
      .r.on{animation:r .55s ease-out}
      @keyframes r{from{opacity:.95;scale:.3}to{opacity:0;scale:1.7}}
    </style><div class="p">${ARROW}<span class="t">Claude</span></div><div class="r"></div>`;
    (document.body || document.documentElement).appendChild(host);
    const p = root.querySelector(".p");
    const ring = root.querySelector(".r");
    // From the middle the first time, so the first move is seen.
    p.style.transform = `translate(${innerWidth / 2}px, ${innerHeight / 2}px)`;
    pointer = { host, p, ring };
    return pointer;
  };
  /** Moves the pointer to (x, y), and resolves once it is there. */
  const glide = (x, y) => {
    const { host, p } = draw();
    try {
      // Shown again, so it is on top of whatever the page put in the top layer since.
      if (host.matches(":popover-open")) host.hidePopover();
      host.showPopover();
    } catch {
      /* no popover in this engine: fixed and z-indexed is near enough */
    }
    void p.offsetWidth;
    p.style.opacity = "1";
    p.style.transform = `translate(${x}px, ${y}px)`;
    clearTimeout(fade);
    fade = setTimeout(() => (p.style.opacity = "0"), 5000);
    return new Promise((r) => setTimeout(r, 380));
  };
  const press = (x, y) => {
    if (!pointer) return;
    const { ring } = pointer;
    ring.style.translate = `${x}px ${y}px`;
    ring.classList.remove("on");
    void ring.offsetWidth;
    ring.classList.add("on");
  };
  /** Out of the picture, for a screenshot. */
  const veil = () => {
    if (!pointer) return;
    pointer.p.style.transition = "none";
    pointer.p.style.opacity = "0";
    // A page out of sight never finishes the ring's animation.
    pointer.ring.classList.remove("on");
    void pointer.p.offsetWidth;
    pointer.p.style.transition = "";
  };

  /* ── acting on the page ──────────────────────────────────────── */

  // A page out of sight draws no frames, so the wait for two has a limit.
  const frames = () =>
    Promise.race([
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60)))),
      new Promise((r) => setTimeout(r, 200)),
    ]);

  /**
   * A point that lands on the element: its middle, unless that is a gap (a
   * link wrapped onto two lines) or something lies over it, then the middle
   * of one of its boxes that is clear.
   */
  const spot = (el) => {
    const r = el.getBoundingClientRect();
    const boxes = [r, ...el.getClientRects()];
    for (const b of boxes) {
      const x = b.x + b.width / 2;
      const y = b.y + b.height / 2;
      const top = document.elementFromPoint(x, y);
      if (top && (el.contains(top) || top.contains(el))) return { x, y };
    }
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };

  /** The element and the point to act at: a ref's middle, or a coordinate. */
  const target = ({ ref, coordinate }) => {
    if (ref) {
      const el = byRef(ref);
      el.scrollIntoView({ block: "center", inline: "center" });
      return { el, ...spot(el) };
    }
    if (!coordinate) throw new Error("Give a coordinate [x, y] or a ref.");
    const [x, y] = coordinate;
    const el = document.elementFromPoint(x, y);
    if (!el) throw new Error(`Nothing at (${x}, ${y}): it is outside the viewport.`);
    return { el, x, y };
  };

  const mouse = (el, type, x, y, extra = {}) => {
    const init = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window, ...extra };
    const E = type.startsWith("pointer") ? PointerEvent : MouseEvent;
    return el.dispatchEvent(new E(type, type.startsWith("pointer") ? { pointerId: 1, pointerType: "mouse", isPrimary: true, ...init } : init));
  };

  const focusable = (el) => el.closest("input,textarea,select,button,a[href],[tabindex],[contenteditable='true'],[contenteditable='']");

  const click = (t, { button = 0, count = 1 } = {}) => {
    const { el, x, y } = t;
    const buttons = button === 2 ? 2 : 1;
    mouse(el, "pointerover", x, y);
    mouse(el, "mouseover", x, y);
    mouse(el, "pointermove", x, y);
    mouse(el, "mousemove", x, y);
    for (let i = 1; i <= count; i++) {
      mouse(el, "pointerdown", x, y, { button, buttons });
      const go = mouse(el, "mousedown", x, y, { button, buttons, detail: i });
      if (go && i === 1) {
        const f = focusable(el);
        if (f) f.focus();
        else if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      }
      mouse(el, "pointerup", x, y, { button });
      mouse(el, "mouseup", x, y, { button, detail: i });
      if (button === 2) mouse(el, "contextmenu", x, y, { button });
      // A real click on a <label>, a link or a submit button does what it
      // does; el.click() runs the same default actions a person's would.
      else if (i === 1) el.click();
      else mouse(el, "click", x, y, { button, detail: i });
    }
    if (count === 2) mouse(el, "dblclick", x, y, { detail: 2 });
  };

  /**
   * HTML5 drag and drop, as the page hears it from a person: one
   * DataTransfer from dragstart to drop, dragenter and dragover on whatever is
   * passed over, and a drop only where the page said it may land.
   */
  const dragAndDrop = async (source, x0, y0, x1, y1) => {
    const data = new DataTransfer();
    const drag = (el, type, x, y) =>
      el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, dataTransfer: data }));
    if (!drag(source, "dragstart", x0, y0)) return `The page would not let ${describe(source)} be dragged.`;
    let over = null;
    let allowed = false;
    for (let i = 1; i <= 8; i++) {
      const x = x0 + ((x1 - x0) * i) / 8;
      const y = y0 + ((y1 - y0) * i) / 8;
      const el = document.elementFromPoint(x, y);
      drag(source, "drag", x, y);
      if (el !== over) {
        if (over) drag(over, "dragleave", x, y);
        if (el) drag(el, "dragenter", x, y);
        over = el;
      }
      // Cancelled, a dragover says a drop is welcome here.
      allowed = !!el && !drag(el, "dragover", x, y);
      await new Promise((r) => setTimeout(r, 25));
    }
    const dropped = allowed && over;
    if (dropped) drag(over, "drop", x1, y1);
    else if (over) drag(over, "dragleave", x1, y1);
    drag(source, "dragend", x1, y1);
    await frames();
    return dropped
      ? `Dragged ${describe(source)} onto ${describe(over)} at (${x1}, ${y1}).`
      : `Dragged ${describe(source)} to (${x1}, ${y1}), where the page takes no drop.`;
  };

  const describe = (el) => {
    const role = roleOf(el);
    // A plain container's text is everything inside it: its tag says enough.
    if (!role && !interactive(el, role)) return el.tagName.toLowerCase();
    const name = nameOf(el);
    return `${role || el.tagName.toLowerCase()}${name ? ` "${name}"` : ""}`;
  };

  /** Typing into whatever has focus, as React and the rest expect to hear it. */
  const type = (text) => {
    const el = document.activeElement;
    if (!el || el === document.body) throw new Error("Nothing has focus to type into: click a field first.");
    if (el.isContentEditable) {
      document.execCommand("insertText", false, text);
      return `Typed into ${describe(el)}.`;
    }
    if (!("value" in el)) throw new Error(`${describe(el)} does not take text.`);
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    for (const ch of text) el.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
    setValue(el, next);
    try {
      el.setSelectionRange(start + text.length, start + text.length);
    } catch {}
    for (const ch of text) el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
    return `Typed into ${describe(el)}.`;
  };

  /** Sets a field the way a framework listening to it will notice. */
  const setValue = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const KEYS = { enter: "Enter", return: "Enter", tab: "Tab", escape: "Escape", esc: "Escape", backspace: "Backspace", delete: "Delete", space: " ", up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", home: "Home", end: "End", pageup: "PageUp", pagedown: "PageDown" };

  /** `Enter`, `Tab Tab`, `ctrl+a`, `shift+Tab`: each, in turn, with what it does by default. */
  const pressKeys = (text) => {
    for (const combo of text.trim().split(/\s+/)) {
      const parts = combo.split("+");
      const raw = parts.pop();
      const key = KEYS[raw.toLowerCase()] || (raw.length === 1 ? raw : raw[0].toUpperCase() + raw.slice(1));
      const mods = parts.map((p) => p.toLowerCase());
      const init = {
        key,
        bubbles: true,
        cancelable: true,
        ctrlKey: mods.includes("ctrl") || mods.includes("control"),
        metaKey: mods.includes("cmd") || mods.includes("meta"),
        shiftKey: mods.includes("shift"),
        altKey: mods.includes("alt") || mods.includes("option"),
      };
      const el = document.activeElement || document.body;
      const go = el.dispatchEvent(new KeyboardEvent("keydown", init));
      if (go) {
        if (key === "Enter") {
          if (el.tagName === "INPUT" && el.form) el.form.requestSubmit();
          else if (el.tagName === "A" || el.tagName === "BUTTON" || el.getAttribute("role") === "button") el.click();
        } else if (key === "Tab") {
          const all = [...document.querySelectorAll("a[href],button,input,select,textarea,[tabindex]:not([tabindex='-1'])")].filter((e) => !e.disabled && visible(e));
          const at = all.indexOf(el);
          all[(at + (init.shiftKey ? -1 : 1) + all.length) % all.length]?.focus();
        } else if (key === "Backspace" && "value" in el && typeof el.value === "string") {
          const s = el.selectionStart ?? el.value.length;
          const e = el.selectionEnd ?? s;
          const from = s === e ? Math.max(0, s - 1) : s;
          setValue(el, el.value.slice(0, from) + el.value.slice(e));
        } else if (key.toLowerCase() === "a" && (init.ctrlKey || init.metaKey) && el.select) {
          el.select();
        } else if (key === " " && (el.tagName === "BUTTON" || el.type === "checkbox")) {
          el.click();
        }
      }
      el.dispatchEvent(new KeyboardEvent("keyup", init));
    }
    return `Pressed ${text}.`;
  };

  const scroller = (el) => {
    for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && (e.scrollHeight > e.clientHeight || e.scrollWidth > e.clientWidth)) return e;
    }
    return document.scrollingElement || document.documentElement;
  };

  const scroll = ({ coordinate, scroll_direction = "down", scroll_amount = 3 }) => {
    const [x, y] = coordinate || [innerWidth / 2, innerHeight / 2];
    const el = document.elementFromPoint(x, y) || document.body;
    const step = 100 * scroll_amount;
    const dx = scroll_direction === "left" ? -step : scroll_direction === "right" ? step : 0;
    const dy = scroll_direction === "up" ? -step : scroll_direction === "down" ? step : 0;
    el.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: x, clientY: y, deltaX: dx, deltaY: dy }));
    scroller(el).scrollBy({ left: dx, top: dy, behavior: "instant" });
    return `Scrolled ${scroll_direction}.`;
  };

  const formInput = ({ ref, value }) => {
    const el = byRef(ref);
    if (el.type === "checkbox" || el.type === "radio") {
      const want = value === true || value === "true" || value === "on" || value === "checked";
      if (el.checked !== want) el.click();
    } else if (el.tagName === "SELECT") {
      const opt = [...el.options].find((o) => o.value === String(value) || o.text.trim() === String(value));
      if (!opt) throw new Error(`${describe(el)} has no option "${value}".`);
      setValue(el, opt.value);
    } else if (el.isContentEditable) {
      el.focus();
      document.execCommand("selectAll");
      document.execCommand("insertText", false, String(value));
    } else if ("value" in el) {
      el.focus();
      setValue(el, String(value));
    } else throw new Error(`${describe(el)} is not a form field.`);
    return `Set ${describe(el)}.`;
  };

  const AsyncFunction = (async () => {}).constructor;
  const evaluate = async ({ code }) => {
    let f;
    try {
      f = new AsyncFunction(`return (${code}\n);`);
    } catch {
      f = new AsyncFunction(code);
    }
    const v = await f();
    if (v === undefined) return "undefined";
    if (v instanceof Element) return v.outerHTML.slice(0, 4000);
    return show(v).slice(0, 20000);
  };

  const COMMANDS = {
    async computer(a) {
      switch (a.action) {
        case "left_click":
        case "right_click":
        case "double_click":
        case "triple_click": {
          const t = target(a);
          await glide(t.x, t.y);
          click(t, { button: a.action === "right_click" ? 2 : 0, count: a.action === "double_click" ? 2 : a.action === "triple_click" ? 3 : 1 });
          press(t.x, t.y);
          await frames();
          return `Clicked ${describe(t.el)} at (${Math.round(t.x)}, ${Math.round(t.y)}).`;
        }
        case "hover": {
          const t = target(a);
          await glide(t.x, t.y);
          mouse(t.el, "pointerover", t.x, t.y);
          mouse(t.el, "mouseover", t.x, t.y);
          mouse(t.el, "pointerenter", t.x, t.y);
          mouse(t.el, "mouseenter", t.x, t.y);
          mouse(t.el, "mousemove", t.x, t.y);
          await frames();
          return `Hovering ${describe(t.el)}.`;
        }
        case "type": {
          const r = type(a.text ?? "");
          await frames();
          return r;
        }
        case "key": {
          const r = pressKeys(a.text ?? "");
          await frames();
          return r;
        }
        case "scroll": {
          const r = scroll(a);
          await frames();
          return r;
        }
        case "scroll_to": {
          byRef(a.ref).scrollIntoView({ block: "center" });
          await frames();
          return `Scrolled to ${a.ref}.`;
        }
        case "left_click_drag": {
          const [x0, y0] = a.start_coordinate || [];
          const [x1, y1] = a.coordinate || [];
          const from = document.elementFromPoint(x0, y0);
          if (!from) throw new Error(`Nothing at (${x0}, ${y0}).`);
          const source = from.closest('[draggable="true"]');
          if (source) {
            await glide(x0, y0);
            void glide(x1, y1);
            return dragAndDrop(source, x0, y0, x1, y1);
          }
          mouse(from, "pointerdown", x0, y0, { buttons: 1 });
          mouse(from, "mousedown", x0, y0, { buttons: 1 });
          for (let i = 1; i <= 8; i++) {
            const x = x0 + ((x1 - x0) * i) / 8;
            const y = y0 + ((y1 - y0) * i) / 8;
            const over = document.elementFromPoint(x, y) || from;
            mouse(over, "pointermove", x, y, { buttons: 1 });
            mouse(over, "mousemove", x, y, { buttons: 1 });
          }
          const to = document.elementFromPoint(x1, y1) || from;
          mouse(to, "pointerup", x1, y1);
          mouse(to, "mouseup", x1, y1);
          await frames();
          return `Dragged from (${x0}, ${y0}) to (${x1}, ${y1}).`;
        }
        case "wait": {
          await new Promise((r) => setTimeout(r, Math.min(10, a.duration ?? 1) * 1000));
          return "Waited.";
        }
        default:
          throw new Error(`Unknown action: ${a.action}`);
      }
    },
    /**
     * Where to act, for input given from outside the page: the pointer goes
     * there first. `native` names a control whose click opens the system's
     * own UI, which is out of the page and out of Claude's sight and reach.
     */
    async locate(a) {
      const t = target(a);
      await glide(t.x, t.y);
      if (a.action === "right_click") [menuFor, pageMenu] = [performance.now(), false];
      const field = t.el.closest("label")?.control ?? t.el;
      const select = t.el.closest("select");
      const native = select
        ? { kind: "select", ref: refOf(select), options: optionsOf(select) }
        : field instanceof HTMLInputElement && (field.type === "file" || field.type === "color")
          ? { kind: field.type, ref: refOf(field) }
          : null;
      // A ref's element can be under another, which a real click lands on.
      const top = document.elementFromPoint(t.x, t.y);
      const covered = top && !t.el.contains(top) && !top.contains(t.el);
      const what = covered ? `${describe(t.el)} (under ${describe(top)}, which is what was hit)` : describe(t.el);
      return { x: t.x, y: t.y, what, native };
    },
    /** Whether a right-click just now opened a menu of the page's own. */
    menu() {
      return pageMenu;
    },
    /** Whether a drag from (x, y) is HTML5 drag and drop, which follows only a real mouse. */
    draggable({ x, y }) {
      return !!document.elementFromPoint(x, y)?.closest('[draggable="true"]');
    },
    async glide({ x, y }) {
      await glide(x, y);
      return "";
    },
    press({ x, y }) {
      press(x, y);
      return "";
    },
    async veil() {
      veil();
      await frames();
      return "";
    },
    /** What typing would go into, if anything. */
    focused() {
      const el = document.activeElement;
      return !el || el === document.body ? null : describe(el);
    },
    read_page: readPage,
    find,
    form_input: formInput,
    get_page_text: () => `Title: ${document.title}\nURL: ${location.href}\n\n${(document.body?.innerText || "").slice(0, 50000)}`,
    javascript: evaluate,
  };

  const answer = async (id, name, args) => {
    try {
      const run = COMMANDS[name];
      if (!run) throw new Error(`Unknown command: ${name}`);
      post({ type: "reply", id, ok: true, value: await run(args || {}) });
    } catch (err) {
      post({ type: "reply", id, ok: false, value: String((err && err.message) || err) });
    }
  };

  if (native) {
    // Fixed in place before the page's own scripts run, so a page cannot answer for it.
    Object.defineProperty(window, "__slop", {
      value: Object.freeze({
        run: (id, name, args) => void answer(id, name, args),
        drain: () => {
          const all = outbox;
          outbox = [];
          return all;
        },
      }),
    });
    return;
  }

  addEventListener("message", (e) => {
    if (e.source !== window.parent || !e.data || !e.data.__slopCmd) return;
    void answer(e.data.id, e.data.name, e.data.args);
  });

  // A link off this machine cannot be framed: the preview opens it as a page
  // from the web instead. Left to the page first, which may route it itself.
  // The preview is one page, so what would open a new window opens there too.
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/;
  const outside = (href, local = false) => {
    try {
      const u = new URL(href, location.href);
      return /^https?:$/.test(u.protocol) && (local || !LOCAL.test(u.hostname)) ? u.href : null;
    } catch {
      return null;
    }
  };
  addEventListener("click", (e) => {
    const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
    const url = a && !e.defaultPrevented && e.button === 0 && outside(a.href, a.target === "_blank");
    if (!url) return;
    e.preventDefault();
    post({ type: "open", url });
  });
  const open = window.open;
  window.open = function (url, ...rest) {
    const away = url && String(url).trim() && outside(String(url), true);
    if (!away) return open.call(this, url, ...rest);
    post({ type: "open", url: away });
    return null;
  };
})();
