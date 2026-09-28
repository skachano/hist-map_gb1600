import { expect, test } from "@playwright/test";
import { legendTitle, open } from "./helpers";

test("year slider, step keys and play move the year", async ({ page }) => {
  const errors = await open(page, "#/map?year=1628&right=high_justice&lang=en");
  await expect(legendTitle(page)).toHaveText("Holders · High justice · 1628");
  await page.keyboard.press("ArrowRight");
  await expect(legendTitle(page)).toContainText("1629");
  await expect(page).toHaveURL(/year=1629/);
  await page.getByRole("button", { name: "Previous year" }).click();
  await expect(page.locator("footer output")).toHaveText("1628");
  await page.getByRole("slider", { name: "Year" }).fill("1610");
  await expect(legendTitle(page)).toContainText("1610");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator("footer output")).toHaveText("1611", { timeout: 5000 });
  await page.getByRole("button", { name: "Pause" }).click();
  expect(errors).toEqual([]);
});

test("right-type tabs change what the map shows", async ({ page }) => {
  await open(page, "#/map?year=1600&right=suzerain&lang=en");
  await page.getByRole("button", { name: "Manorial lordship" }).click();
  await expect(legendTitle(page)).toContainText("Manorial lordship");
  await page.getByRole("combobox", { name: "Other rights" }).selectOption("tithe");
  await expect(legendTitle(page)).toContainText("Tithe");
  await expect(page).toHaveURL(/right=tithe/);
});

test("language switch translates the interface and the names", async ({ page }) => {
  // Vaudrevange is the book's (French) name; German and English use Wallerfangen.
  await open(page, "#/map?year=1624&right=high_justice&lang=fr&place=vaudrevange");
  await expect(page.locator("#panel h2")).toHaveText("Vaudrevange");
  await expect(legendTitle(page)).toHaveText(/^Détenteurs · Haute justice/);
  await page.getByRole("button", { name: "Deutsch" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator("#header h1")).toHaveText("Deutsches Bellistum Lothringen, 1600–1632");
  await expect(page.getByRole("button", { name: "Hochgerichtsbarkeit" })).toBeVisible();
  await expect(page.locator("#panel h2")).toHaveText("Wallerfangen");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("#header h1")).toHaveText("German Bailiwick of Lorraine, 1600–1632");
});

test("place panel shows names, rights with pages, the timeline and changes", async ({ page }) => {
  await open(page, "#/map?year=1624&right=high_justice&lang=en&place=anzeling");
  const panel = page.locator("#panel");
  await expect(panel.locator("h2")).toHaveText("Anzeling");
  await expect(panel).toContainText("FR Anzeling · DE Anzelingen · EN Anzeling");
  await expect(panel).toContainText("village · village · Dorf");
  await expect(panel).toContainText("Office of Sierck");
  await expect(panel.getByRole("listitem").filter({ hasText: "Henriette de Vaudémont · held in pledge" }).first())
    .toContainText("p. 51");
  await expect(panel.locator("svg.gantt").first()).toBeVisible();
  await expect(panel.locator(".events")).toContainText("1624 pledge (engagement)");
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toBeHidden();
  await expect(page).not.toHaveURL(/place=/);
});

test("a disputed place: listed in the disputes view, flagged in its panel", async ({ page }) => {
  const errors = await open(page, "#/disputes?year=1616&right=suzerain&lang=en");
  const side = page.locator("#side");
  await expect(side.locator("h2")).toContainText("Disputes in 1616");
  await side.getByRole("button", { name: "Bambiderstroff" }).click();
  const panel = page.locator("#panel");
  await expect(panel.locator("h2")).toHaveText("Bambiderstroff");
  await expect(panel.locator(".warn").first()).toContainText("⚠ against");
  expect(errors).toEqual([]);
});

test("keyboard: panel takes focus, Escape closes it and returns focus; skip link", async ({ page }) => {
  await open(page, "#/matrix?year=1629&right=suzerain&lang=en");
  const link = page.getByRole("button", { name: "Anzeling" });
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#panel h2")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#panel")).toBeHidden();
  await expect(link).toBeFocused();
  await open(page, "#/map?year=1624&right=high_justice&lang=en");
  await page.reload(); // a hash change keeps focus where it was; the skip link is for a fresh page
  await expect(page.locator("#header h1")).toBeVisible();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("button", { name: /Skip the map/ });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/matrix/);
});
