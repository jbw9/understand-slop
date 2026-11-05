import { mkdirSync, rmSync } from "node:fs";

const CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18'%3E%3Cpath d='M2 1l12 9-5.5.8L12 17l-2.4 1-3.4-6.3L2 15z' fill='black' stroke='white' stroke-width='1.2'/%3E%3C/svg%3E\")";

export async function recorder(page, dir = "frames", fps = 30) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  await page.addInitScript((bg) => {
    addEventListener("DOMContentLoaded", () => {
      const c = document.createElement("div");
      c.style.cssText = `position:fixed;z-index:2147483647;pointer-events:none;width:18px;height:18px;margin:-2px 0 0 -2px;left:-40px;top:-40px;background:${bg}`;
      document.body.appendChild(c);
      addEventListener(
        "pointermove",
        (e) => {
          c.style.left = e.clientX + "px";
          c.style.top = e.clientY + "px";
        },
        true,
      );
    });
  }, CURSOR);

  let n = 0;
  let at = { x: page.viewportSize().width / 2, y: page.viewportSize().height / 2 };
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const frame = () => page.screenshot({ path: `${dir}/${String(n++).padStart(5, "0")}.png` });

  const r = {
    fps,
    get frames() {
      return n;
    },
    frame,
    async hold(frames = Math.round(fps / 2)) {
      for (let i = 0; i < frames; i++) await frame();
    },
    async pause(ms) {
      await page.waitForTimeout(ms);
    },
    async glide(to, steps = 24) {
      const from = at;
      for (let i = 1; i <= steps; i++) {
        const t = ease(i / steps);
        await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
        await frame();
      }
      at = to;
    },
    async centre(locator) {
      const b = await locator.boundingBox();
      if (!b) throw new Error("recorder.centre: element is not on screen");
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    },
    async press() {
      await page.mouse.down();
      await r.hold(6);
    },
    async release(settleMs = 400) {
      await page.mouse.up();
      await page.waitForTimeout(settleMs);
    },
    async click(settleMs = 500) {
      await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(settleMs);
    },
    async type(text, delayMs = 60) {
      for (const ch of text) {
        await page.keyboard.type(ch);
        await page.waitForTimeout(delayMs);
        await frame();
      }
    },
  };
  await page.mouse.move(at.x, at.y);
  return r;
}
