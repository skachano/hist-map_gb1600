// Runs in the desktop and phone projects: no view may be wider than the screen or log errors.
import { expect, test } from "@playwright/test";
import { open } from "./helpers";

const VIEWS = [
  "#/map?year=1624&right=high_justice&lang=en",
  "#/map?year=1624&right=high_justice&lang=fr&place=anzeling",
  "#/disputes?year=1616&right=suzerain&lang=de",
  "#/entity?year=1624&right=high_justice&lang=en&entity=duchy-lorraine",
  "#/matrix?year=1629&right=suzerain&lang=en",
  "#/changes?year=1629&right=suzerain&lang=en",
  "#/about?year=1600&right=suzerain&lang=fr",
];

for (const hash of VIEWS) {
  test(`layout ${hash}`, async ({ page }) => {
    const errors = await open(page, hash);
    await page.waitForTimeout(500);
    const width = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: window.innerWidth }));
    expect(width.page).toBeLessThanOrEqual(width.screen);
    expect(errors).toEqual([]);
  });
}
