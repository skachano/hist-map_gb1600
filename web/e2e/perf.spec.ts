// Performance budgets, measured with performance.measure() marks in src/main.ts.
import { expect, test } from "@playwright/test";
import { open } from "./helpers";

const measures = (page: import("@playwright/test").Page, prefix: string) =>
  page.evaluate((p) => performance.getEntriesByType("measure").filter((m) => m.name.startsWith(p)).map((m) => m.duration), prefix);

test("load, year change and table stay within budget", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop");
  await open(page, "#/map?year=1600&right=suzerain&lang=en");
  const [load] = await measures(page, "load-data");
  const [firstRender] = await measures(page, "render:map");

  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
  await expect(page.locator("footer output")).toHaveText("1610");
  const steps = (await measures(page, "render:map")).slice(1);
  const slowestStep = Math.max(...steps);

  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page.locator("table.matrix tbody tr").first()).toBeVisible();
  const [table] = await measures(page, "render:matrix");

  console.log(JSON.stringify({ loadDataMs: Math.round(load), firstRenderMs: Math.round(firstRender),
    yearStepMsMax: Math.round(slowestStep), yearStepMsMedian: Math.round(steps.sort((a, b) => a - b)[5]),
    tableMs: Math.round(table) }));
  expect(load + firstRender).toBeLessThan(3000);
  expect(slowestStep).toBeLessThan(200);
  expect(table).toBeLessThan(1500);
});
