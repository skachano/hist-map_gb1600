// Automated accessibility checks (axe-core, WCAG 2.1 A/AA) on every view.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { open } from "./helpers";

const VIEWS = [
  "#/map?year=1624&right=high_justice&lang=en",
  "#/map?year=1624&right=high_justice&lang=fr&place=anzeling",
  "#/disputes?year=1616&right=suzerain&lang=de",
  "#/entity?year=1624&right=high_justice&lang=en&entity=duchy-lorraine",
  "#/matrix?year=1629&right=suzerain&lang=en",
  "#/changes?year=1629&right=suzerain&lang=en",
  "#/about?year=1600&right=suzerain&lang=de",
];

for (const hash of VIEWS) {
  test(`a11y ${hash}`, async ({ page }) => {
    await open(page, hash);
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    for (const v of results.violations) {
      console.log(`[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(" ")}`);
    }
    expect(serious.map((v) => v.id)).toEqual([]);
  });
}
