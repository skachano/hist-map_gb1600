import { expect, type Page } from "@playwright/test";

/** Open a view by URL and wait until the app has rendered it; collects console errors. */
export async function open(page: Page, hash: string): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`/${hash}`);
  await expect(page.locator("#header h1")).toBeVisible();
  await expect(page.locator("#status")).toHaveCount(0); // removed once the data has loaded
  return errors;
}

export const legendTitle = (page: Page) => page.locator("#legend h2");
