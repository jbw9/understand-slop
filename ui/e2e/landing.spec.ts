import { expect, test, type Page } from "@playwright/test";

function stars(page: Page, count: number) {
  return page.route("https://api.github.com/repos/**", (route) => route.fulfill({ json: { stargazers_count: count } }));
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
  await expect(page.getByRole("link", { name: "GitHub", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /GitHub\s*0/ })).toHaveCount(0);
});

test("a real star count is shown", async ({ page }) => {
  await page.unrouteAll();
  await stars(page, 42);
  await page.goto("/landing");
  await expect(page.getByRole("link", { name: "GitHub 42", exact: true })).toBeVisible();
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
  const tops = await page.getByRole("tab").evaluateAll((tabs) => tabs.map((t) => t.getBoundingClientRect().top));
  expect(new Set(tops).size).toBe(1);
});
