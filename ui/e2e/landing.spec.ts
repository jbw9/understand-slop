import { expect, test, type Page } from "@playwright/test";

function stars(page: Page, count: number) {
  return page.route("https://api.github.com/repos/**", (route) => route.fulfill({ json: { stargazers_count: count } }));
}

const scrollTop = (page: Page) => page.locator("main").evaluate((m) => m.parentElement!.scrollTop);

/** Brings the demo on screen, clicks what the tour rings, and returns the page's scroll before the click. */
async function clickRing(page: Page) {
  await page.locator("iframe").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const box = (await page.locator("[data-ring]").boundingBox())!;
  const before = await scrollTop(page);
  await page.mouse.click(box.x + box.width / 2, box.y + 20);
  return before;
}

test.beforeEach(async ({ page }) => {
  await stars(page, 0);
});

test("the first map shows without picking a tab", async ({ page }) => {
  // Hydrate the page only after the framed map has loaded, so its load event fires first.
  await page.route("**/_next/static/**", async (route) => {
    if (route.request().frame() === page.mainFrame()) await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  await page.goto("/landing");
  await expect(page.getByText("loading understand-slop")).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCSS("opacity", "1");
  await expect(page.frameLocator("iframe").getByRole("heading", { name: "understand-slop" })).toBeVisible();
});

test("each tab opens its own map", async ({ page }) => {
  await page.goto("/landing");
  const tab = page.getByRole("tab", { name: "Flask" });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "TBD itself" })).toHaveAttribute("aria-selected", "false");
  await expect(page.locator("iframe")).toHaveAttribute("src", /map=flask/);
  await expect(page.locator("iframe")).toHaveCSS("opacity", "1");
  await expect(page.frameLocator("iframe").getByRole("heading", { name: "flask" })).toBeVisible();
});

test("the page never scrolls sideways", async ({ page }) => {
  await page.goto("/landing");
  const width = await page.evaluate(() => {
    const scroller = document.querySelector("main")!.parentElement!;
    return { scroll: Math.max(scroller.scrollWidth, document.documentElement.scrollWidth), view: innerWidth };
  });
  expect(width.scroll).toBeLessThanOrEqual(width.view);
});

test("headings stay tight when they wrap", async ({ page }) => {
  await page.goto("/landing");
  for (const h of await page.locator("h1, h2").all()) {
    const ratio = await h.evaluate((el) => {
      const s = getComputedStyle(el);
      return parseFloat(s.lineHeight) / parseFloat(s.fontSize);
    });
    expect(ratio).toBeLessThanOrEqual(1.25);
  }
});

test("a zero star count is not shown", async ({ page }) => {
  await page.goto("/landing");
  await expect(page.getByRole("link", { name: "View on GitHub", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /GitHub\s*0/ })).toHaveCount(0);
});

test("a real star count is shown", async ({ page }) => {
  await page.unrouteAll();
  await stars(page, 42);
  await page.goto("/landing");
  await expect(page.getByRole("link", { name: "View on GitHub 42", exact: true })).toBeVisible();
});

test("the framed map keeps its repo name on one line on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "only narrow frames wrap");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/landing");
  const crumb = page.frameLocator("iframe").getByRole("navigation", { name: "Location" }).getByRole("button").first();
  const box = await crumb.boundingBox();
  expect(box!.height).toBeLessThan(30);
  await expect(page.frameLocator("iframe").getByText("back", { exact: true })).toBeHidden();
});

test("the repo tabs fit one row on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "only narrow screens wrap");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/landing");
  const tops = await page.getByRole("tablist", { name: "Repository" }).getByRole("tab").evaluateAll((tabs) => tabs.map((t) => t.getBoundingClientRect().top));
  expect(new Set(tops).size).toBe(1);
});

test("a tour starts on the first map, and can be skipped and taken again", async ({ page }) => {
  await page.goto("/landing");
  const tip = page.getByRole("status");
  await expect(tip).toContainText("Each card is one step");
  await expect(tip).toContainText("1 / 5");
  await tip.getByRole("button", { name: "Skip tour" }).click();
  await expect(tip).toBeHidden();
  await page.getByRole("button", { name: "Take the tour" }).click();
  await expect(tip).toContainText("1 / 5");
});

test("clicking the card the tour points at moves it on", async ({ page }) => {
  await page.goto("/landing");
  await expect(page.getByRole("status")).toContainText("1 / 5");
  await clickRing(page);
  await expect(page.getByRole("status")).toContainText("2 / 5");
});

test("a visitor who reads before clicking still gets the next step", async ({ page }) => {
  await page.goto("/landing");
  await expect(page.getByRole("status")).toContainText("1 / 5");
  await page.waitForTimeout(5000);
  await clickRing(page);
  await expect(page.getByRole("status")).toContainText("2 / 5");
});

test("going off script shows the step for where the visitor is", async ({ page }) => {
  await page.goto("/landing");
  await expect(page.getByRole("status")).toContainText("1 / 5");
  const frame = page.frameLocator("iframe");
  // Not the card the tour rings: the second one, opened from the keyboard, since a phone's tip can cover it.
  await frame.locator("button[data-path]:not([disabled])").nth(1).press("Enter");
  await expect(page.getByRole("status")).toContainText("2 / 5");
  await frame.locator("body").press("Escape");
  await expect(page.getByRole("status")).toContainText("1 / 5");
});

test("switching repository ends the tour", async ({ page }) => {
  await page.goto("/landing");
  await expect(page.getByRole("status")).toContainText("1 / 5");
  await page.getByRole("tab", { name: "Flask" }).click();
  await expect(page.getByRole("status")).toBeHidden();
  await expect(page.getByRole("button", { name: "Take the tour" })).toBeVisible();
});

test("switching repository by arrow key ends the tour", async ({ page }) => {
  await page.goto("/landing");
  await expect(page.getByRole("status")).toContainText("1 / 5");
  await page.getByRole("tab", { name: "TBD itself" }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Flask" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("status")).toBeHidden();
  await expect(page.getByRole("button", { name: "Take the tour" })).toBeVisible();
});

test("switching repository while the tour restarts keeps it ended", async ({ page }) => {
  await page.goto("/landing");
  const tip = page.getByRole("status");
  await clickRing(page);
  await expect(tip).toContainText("2 / 5");
  await tip.getByRole("button", { name: "Skip tour" }).click();
  await page.getByRole("button", { name: "Take the tour" }).click();
  await page.getByRole("tab", { name: "Flask" }).click();
  await expect(page.frameLocator("iframe").getByRole("heading", { name: "flask" })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(tip).toBeHidden();
});

test("switching repository hides the tour's last word", async ({ page }) => {
  await page.goto("/landing");
  const tip = page.getByRole("status");
  for (const n of [2, 3, 4, 5]) {
    await clickRing(page);
    await expect(tip).toContainText(`${n} / 5`);
  }
  await tip.getByRole("button", { name: "Done" }).click();
  await expect(tip).toContainText("That's the whole loop");
  await page.getByRole("tab", { name: "Flask" }).click();
  await expect(tip).toBeHidden();
});

test("the ring stays on its card while the demo scrolls", async ({ page }) => {
  await page.goto("/landing");
  await expect(page.getByRole("status")).toContainText("1 / 5");
  await page.locator("iframe").scrollIntoViewIfNeeded();
  const gaps = await page.evaluate(
    () =>
      new Promise<number[]>((done) => {
        const frame = document.querySelector("iframe")!;
        const ring = document.querySelector<HTMLElement>("[data-ring]")!;
        const card = frame.contentDocument!.querySelector("button[data-path]:not([disabled])")!;
        const scroller = frame.contentDocument!.querySelector("main")!;
        const gaps: number[] = [];
        let n = 0;
        const tick = () => {
          if (n > 2) {
            const r = ring.getBoundingClientRect();
            const c = card.getBoundingClientRect();
            const f = frame.getBoundingClientRect();
            gaps.push(Math.abs(r.top + 5 - (f.top + c.top)));
          }
          if (++n > 20) return done(gaps);
          scroller.scrollBy(0, 6);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(Math.max(...gaps)).toBeLessThanOrEqual(7);
});

test("the tip never covers the card it points at", async ({ page }) => {
  await page.goto("/landing");
  const tip = page.getByRole("status");
  for (const n of [1, 2, 3, 4]) {
    if (n > 1) await clickRing(page);
    await expect(tip).toContainText(`${n} / 5`);
    await page.waitForTimeout(600);
    const [t, r] = [(await tip.boundingBox())!, (await page.locator("[data-ring]").boundingBox())!];
    const overlap = t.x < r.x + r.width && r.x < t.x + t.width && t.y < r.y + r.height && r.y < t.y + t.height;
    expect(overlap, `step ${n}`).toBe(false);
  }
});

test("opening the code inside the demo never scrolls the page", async ({ page }) => {
  await page.goto("/landing");
  const tip = page.getByRole("status");
  await expect(tip).toContainText("1 / 5");
  for (const n of [2, 3, 4]) {
    await clickRing(page);
    await expect(tip).toContainText(`${n} / 5`);
  }
  // Opening a row scrolls its lines into view, which must stay inside the frame.
  const before = await clickRing(page);
  await expect(tip).toContainText("5 / 5");
  await page.waitForTimeout(1000);
  expect(await scrollTop(page)).toBe(before);
});

test("Esc goes back a level even when the page around the demo has focus", async ({ page }) => {
  await page.goto("/landing");
  const tip = page.getByRole("status");
  for (const n of [2, 3]) {
    await clickRing(page);
    await expect(tip).toContainText(`${n} / 5`);
  }
  const at = () => page.locator("iframe").evaluate((f: HTMLIFrameElement) => f.contentWindow!.location.search);
  expect(await at()).toContain("at=gn-scan");
  await page.getByText("This is the app").click();
  await page.keyboard.press("Escape");
  await expect(tip).toContainText("2 / 5");
  await expect.poll(at).not.toContain("gn-scan");
});

test("Esc steps back one layer at a time: the lines, the code, then the level", async ({ page }) => {
  await page.goto("/landing");
  const tip = page.getByRole("status");
  for (const n of [2, 3, 4, 5]) {
    await clickRing(page);
    await expect(tip).toContainText(`${n} / 5`);
  }
  for (const n of [4, 3, 2]) {
    await page.keyboard.press("Escape");
    await expect(tip).toContainText(`${n} / 5`);
  }
});

test("Done on the last step ends the tour", async ({ page }) => {
  await page.goto("/landing");
  const tip = page.getByRole("status");
  for (const n of [2, 3, 4, 5]) {
    await clickRing(page);
    await expect(tip).toContainText(`${n} / 5`);
  }
  await expect(tip.getByRole("button", { name: "Skip tour" })).toHaveCount(0);
  await tip.getByRole("button", { name: "Done" }).click();
  await expect(tip).toContainText("That's the whole loop");
  await expect(page.getByRole("button", { name: "Take the tour" })).toBeVisible();
});

test("each How it works tab shows its own window", async ({ page }) => {
  await page.goto("/landing");
  const rail = page.getByRole("tablist", { name: "How it works" });
  const tab = rail.getByRole("tab", { name: /Keep going to the code/ });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", (await tab.getAttribute("id"))!);
  await expect(page.locator("[data-win=code]")).toBeVisible();
  await expect(page.locator("[data-win=steps]")).toBeHidden();
});
