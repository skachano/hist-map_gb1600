import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("holders view: pick an entity, see holdings, rulers and changes", async ({ page }) => {
  await open(page, "#/entity?year=1624&right=high_justice&lang=en");
  const side = page.locator("#side");
  await side.getByRole("combobox", { name: "Choose a holder" }).selectOption("duchy-lorraine");
  await expect(side.locator("h2")).toHaveText("Duchy of Lorraine");
  await expect(side).toContainText("Held directly in 1624");
  await expect(side.locator("svg.gantt")).toBeVisible(); // rulers
  await expect(side).toContainText("Henri II");
  await expect(page).toHaveURL(/entity=duchy-lorraine/);
});

test("legend holder names open the holders view; ● recolours", async ({ page }) => {
  await open(page, "#/map?year=1624&right=high_justice&lang=en");
  const legend = page.locator("#legend");
  const first = legend.locator(".others button.pick").first();
  const name = await legend.locator(".others .label").first().innerText();
  await first.click();
  await expect(page).toHaveURL(/c=/);
  await expect(legend.locator("ul").first()).toContainText(name);
  await legend.getByRole("button", { name: "Reset colours" }).click();
  await expect(page).not.toHaveURL(/c=/);
  await legend.getByRole("button", { name: "Duchy of Lorraine" }).click();
  await expect(page).toHaveURL(/#\/entity\?.*entity=duchy-lorraine/);
});

test("table: filter by territory and holder, export CSV", async ({ page }) => {
  await open(page, "#/matrix?year=1629&right=suzerain&lang=en");
  const rows = page.locator("table.matrix tbody tr");
  const all = await rows.count();
  expect(all).toBeGreaterThan(900);
  await page.getByRole("combobox", { name: "Territory" }).selectOption("office-sierck");
  await expect.poll(() => rows.count()).toBeLessThan(all);
  await expect(page.locator("table.matrix")).toContainText("Anzeling");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const csv = await (await download).createReadStream();
  const text = await new Promise<string>((resolve) => {
    let s = ""; csv.on("data", (c) => (s += c)); csv.on("end", () => resolve(s));
  });
  expect(text.split("\n")[0]).toContain('"Place","id","Suzerainty (dominium directum)"');
  expect(text).toContain('"anzeling"');
  await page.getByRole("button", { name: "Anzeling" }).click();
  await expect(page.locator("#panel h2")).toHaveText("Anzeling");
});

test("changes: a change jumps to its year and place on the map", async ({ page }) => {
  await open(page, "#/changes?year=1600&right=suzerain&lang=en");
  await expect(page.locator(".histogram .bar")).toHaveCount(33);
  await page.getByRole("combobox", { name: "Right" }).selectOption("high_justice");
  const item = page.locator("ol.changes li li").filter({ hasText: "Anzeling" }).first();
  await item.getByRole("button", { name: "Anzeling" }).click();
  await expect(page).toHaveURL(/#\/map\?year=1624&right=high_justice.*place=anzeling/);
  await expect(page.locator("#panel h2")).toHaveText("Anzeling");
});

test("about page cites the book and the data sources in every language", async ({ page }) => {
  await open(page, "#/map?year=1600&right=suzerain&lang=en");
  await page.getByRole("button", { name: "About & sources" }).click();
  const about = page.locator("article.about");
  await expect(about).toContainText("Henri Hiegel, Le bailliage d'Allemagne de 1600 à 1632");
  await expect(about).toContainText("GeoNames (CC BY 4.0)");
  await page.getByRole("button", { name: "Deutsch" }).click();
  await expect(about).toContainText("Grundkarte © OpenStreetMap-Mitwirkende");
});
