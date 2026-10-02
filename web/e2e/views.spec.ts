import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("holders view: pick an entity, see holdings, rulers and changes", async ({ page }) => {
  await open(page, "#/entity?year=1624&right=high_justice&lang=en");
  const side = page.locator("#side");
  await side.getByRole("combobox", { name: "Choose a holder" }).selectOption("duchy-lorraine");
  await expect(side.locator("h2")).toHaveText("Duchy of Lorraine");
  await expect(side).toContainText("Held directly in 1624");
  await expect(side.locator("svg.gantt")).toBeVisible(); // rulers
  await expect(side).toContainText("Henry II, Duke"); // ruler names and titles are translated
  const dates = side.locator("details.ruler-dates");
  await dates.locator("summary").click(); // where the reign dates come from
  await expect(dates).toContainText("Charles III: reign 1545–1608 from reference works; the book attests …–1608");
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
  // scrolling the table keeps the toolbar and the column headers in view
  const toolbar = page.locator("#page .toolbar");
  const header = page.locator("table.matrix thead th").first();
  const before = (await toolbar.boundingBox())!;
  await page.locator(".table-wrap").evaluate((el) => { el.scrollTop = 2000; });
  await page.getByRole("combobox", { name: "Territory" }).selectOption("");
  await page.locator(".table-wrap").evaluate((el) => { el.scrollTop = 4000; });
  expect((await toolbar.boundingBox())!.y).toBe(before.y);
  const wrap = (await page.locator(".table-wrap").boundingBox())!;
  expect(Math.abs((await header.boundingBox())!.y - wrap.y)).toBeLessThan(3);
  await page.getByRole("combobox", { name: "Territory" }).selectOption("office-sierck");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const csv = await (await download).createReadStream();
  const text = await new Promise<string>((resolve) => {
    let s = ""; csv.on("data", (c) => (s += c)); csv.on("end", () => resolve(s));
  });
  expect(text.split("\n")[0]).toContain('"Place","id","Suzerainty (dominium directum)"');
  expect(text).toContain('"anzeling"');
  await page.getByRole("button", { name: "Anzeling" }).click(); // a place opens on the rights map
  await expect(page).toHaveURL(/#\/map\?year=1629&right=suzerain.*place=anzeling/);
  await expect(page.locator("#panel h2")).toHaveText("Anzeling");
  // …zoomed in on it (Anzeling: 49.2628 N, 6.4661 E)
  type M = { getZoom(): number; getCenter(): { lng: number; lat: number } };
  await expect.poll(() => page.evaluate(() => (window as unknown as { __map: M }).__map.getZoom())).toBeGreaterThanOrEqual(12);
  const c = await page.evaluate(() => (window as unknown as { __map: M }).__map.getCenter());
  expect(Math.abs(c.lng - 6.4661)).toBeLessThan(0.02);
  expect(Math.abs(c.lat - 49.2628)).toBeLessThan(0.02);
});

test("a territory link opens the Territories view, fitted to the realm", async ({ page }) => {
  await open(page, "#/map?year=1624&right=high_justice&lang=en&place=anzeling");
  const panel = page.locator("#panel");
  await panel.locator(".crumbs").getByRole("button", { name: "Office of Sierck" }).click();
  await expect(page).toHaveURL(/#\/territories\?year=1624.*place=office-sierck/);
  await expect(panel.locator("h2")).toHaveText("Office of Sierck");
  // the office spans 6.21-6.69 E, 49.06-49.60 N: fitted, the map zooms in and centres on it
  type M = { getZoom(): number; getCenter(): { lng: number; lat: number }; isMoving(): boolean };
  const map = () => page.evaluate(() => {
    const m = (window as unknown as { __map: M }).__map;
    return { zoom: m.getZoom(), moving: m.isMoving(), ...m.getCenter() };
  });
  await expect.poll(async () => { const m = await map(); return !m.moving && m.zoom > 8.5; }).toBe(true);
  const c = await map();
  expect(c.lng).toBeGreaterThan(6.21); expect(c.lng).toBeLessThan(6.69);
  expect(c.lat).toBeGreaterThan(49.06); expect(c.lat).toBeLessThan(49.6);
  // …in the gap between the realm list (left) and the panel (right)
  const edges = await page.evaluate(() => {
    const m = (window as unknown as { __map: { project(p: [number, number]): { x: number } } }).__map;
    return { west: m.project([6.21, 49.33]).x, east: m.project([6.69, 49.33]).x };
  });
  const side = (await page.locator("#side").boundingBox())!;
  const box = (await panel.boundingBox())!;
  const stage = (await page.locator("#map").boundingBox())!;
  expect(stage.x + edges.west).toBeGreaterThanOrEqual(side.x + side.width);
  expect(stage.x + edges.east).toBeLessThanOrEqual(box.x);
});

test("a territory link shows its hierarchy: administrative divisions or feudal realms", async ({ page }) => {
  const side = page.locator("#side");
  const crumbs = page.locator("#panel .crumbs");
  await open(page, "#/map?year=1624&right=suzerain&lang=en&place=forbach");
  await crumbs.getByRole("button", { name: "Lordship of Forbach" }).click();
  await expect(page).toHaveURL(/#\/territories\?.*place=lordship-forbach/);
  expect(page.url()).toContain("h=feudal");
  await expect(side.getByRole("button", { name: "Feudal realms" })).toHaveAttribute("aria-pressed", "true");
  await expect(side.getByRole("button", { name: "Lordship of Forbach" })).toBeVisible();
  await open(page, "#/map?year=1624&right=suzerain&lang=en&h=feudal&place=forbach");
  await crumbs.getByRole("button", { name: "Office of Forbach" }).click();
  await expect(page).toHaveURL(/#\/territories\?.*place=office-forbach/);
  expect(page.url()).not.toContain("h=feudal");
  await expect(side.getByRole("button", { name: "Administrative divisions" })).toHaveAttribute("aria-pressed", "true");
  await expect(side.getByRole("button", { name: "Office of Forbach" })).toBeVisible();
});

test("a territory link shows its level: offices, their subdivisions or all levels", async ({ page }) => {
  const side = page.locator("#side");
  const panel = page.locator("#panel");
  const pressed = (name: string) => expect(side.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
  await open(page, "#/map?year=1624&right=suzerain&lang=en&place=office-sierck");
  await panel.locator(".members").getByRole("button", { name: "Provostship of Sierck", exact: true }).click();
  await expect(page).toHaveURL(/#\/territories\?.*lvl=2/);
  await pressed("Their subdivisions");
  await expect(side.getByRole("button", { name: "Provostship of Sierck", exact: true })).toBeVisible();
  await panel.locator(".members").getByRole("button", { name: "Mayoralty of Montenach" }).click(); // one level deeper
  await expect(page).toHaveURL(/lvl=0/);
  await pressed("All levels");
  await expect(side.getByRole("button", { name: "Mayoralty of Montenach" })).toBeVisible();
  await panel.locator(".crumbs").getByRole("button", { name: "Office of Sierck" }).click();
  await expect(page).toHaveURL(/lvl=1/);
  await pressed("Offices");
  await expect(side.getByRole("button", { name: "Office of Sierck" })).toBeVisible();
});

test("changes: a change jumps to its year and place on the map", async ({ page }) => {
  await open(page, "#/changes?year=1600&right=suzerain&lang=en");
  await expect(page.locator(".histogram .bar")).toHaveCount(33);
  // a year's bar scrolls the list to that year below the toolbar, which stays in view
  const toolbar = page.locator("#page .toolbar");
  const before = (await toolbar.boundingBox())!;
  await page.getByRole("button", { name: /^1625: / }).click();
  const heading = page.locator("#year-1625");
  await expect.poll(async () => {
    const h = (await heading.boundingBox())!;
    const t = (await toolbar.boundingBox())!;
    return h.y >= t.y + t.height && h.y < t.y + t.height + 60;
  }).toBe(true);
  expect((await toolbar.boundingBox())!.y).toBe(before.y);
  await page.getByRole("combobox", { name: "Right" }).selectOption("high_justice");
  const item = page.locator("ol.changes li li").filter({ hasText: "Anzeling" }).first();
  await item.getByRole("button", { name: "Anzeling" }).click();
  await expect(page).toHaveURL(/#\/map\?year=1616&right=high_justice.*place=anzeling/); // the sale to André des Bordes
  await expect(page.locator("#panel h2")).toHaveText("Anzeling");
});

test("about page cites the book and the data sources in every language", async ({ page }) => {
  await open(page, "#/map?year=1600&right=suzerain&lang=en");
  await page.getByRole("button", { name: "About & sources" }).click();
  const about = page.locator("article.about");
  await expect(about).toContainText("Henri Hiegel, Le bailliage d'Allemagne de 1600 à 1632");
  await expect(about).toContainText("GeoNames (CC BY 4.0)");
  await expect(about).toContainText("Siargey Kachanovich");
  await page.getByRole("button", { name: "Deutsch" }).click();
  await expect(about).toContainText("Daten © OpenStreetMap-Mitwirkende (ODbL)");
});

test("territories: realms of a year, walk down and up the hierarchy, levels and neighbours", async ({ page }) => {
  const errors = await open(page, "#/territories?year=1620&right=suzerain&lang=en");
  const side = page.locator("#side");
  await expect(side.locator("h2")).toHaveText(/^Realms in 1620 \(\d+\)$/);
  // the office of Forbach is a district of the bailiwick; the lordship of Forbach, the fief, lies in it
  await expect(side.getByRole("button", { name: "Office of Forbach" })).toBeVisible();
  await expect(side.getByRole("button", { name: "Lordship of Forbach" })).toHaveCount(0);
  await side.getByRole("button", { name: "Feudal realms" }).click();
  await expect(page).toHaveURL(/h=feudal/);
  await expect(side.getByRole("button", { name: "Lordship of Forbach" })).toBeVisible();
  await expect(side.getByRole("button", { name: "Office of Forbach" })).toHaveCount(0);
  await side.getByRole("button", { name: "Administrative divisions" }).click();
  await expect(page).not.toHaveURL(/h=feudal/);
  await expect(page.locator(".terr-label").filter({ hasText: "Office of Sarreguemines" })).toHaveCount(1);

  await side.getByRole("button", { name: "Office of Sarreguemines" }).click();
  const panel = page.locator("#panel");
  await expect(panel.locator("h2")).toHaveText("Office of Sarreguemines");
  await expect(panel).toContainText("Members in 1620");
  await panel.locator("ul.members").getByRole("button", { name: "Sarreguemines", exact: true }).click();
  await expect(panel.locator("h2")).toHaveText("Sarreguemines");
  await panel.locator(".crumbs").getByRole("button", { name: "Office of Sarreguemines" }).click();
  await expect(panel.locator("h2")).toHaveText("Office of Sarreguemines");

  const count = async () => Number((await side.locator("h2").innerText()).match(/\((\d+)\)/)![1]);
  const level1 = await count();
  await side.getByRole("button", { name: "Their subdivisions" }).click();
  await expect(page).toHaveURL(/lvl=2/);
  await side.getByRole("checkbox", { name: "Also realms outside the bailiwick" }).check();
  await expect(page).toHaveURL(/nb=1/);
  await side.getByRole("button", { name: "Offices", exact: true }).click();
  await expect.poll(count).toBeGreaterThan(level1);
  expect(errors).toEqual([]);
});

test("ⓘ explains the selected right and links to About & sources", async ({ page }) => {
  await open(page, "#/map?year=1620&right=high_justice&lang=en");
  const info = page.locator(".right-info");
  await info.getByLabel("What this right means").click();
  await expect(info.locator(".popover")).toContainText("gallows");
  await page.getByRole("button", { name: "Manorial lordship" }).click(); // stays open, follows the right
  await expect(info.locator(".popover")).toContainText("corvées");
  await info.getByRole("button", { name: /All rights explained/ }).click();
  await expect(page).toHaveURL(/#\/about/);
  await expect(page.locator("#right-manorial_lord")).toBeInViewport();
  await expect(page.locator(".rights-explained dt")).toHaveCount(12);
});

test("Japanese: interface, right names, realm and place names", async ({ page }) => {
  await open(page, "#/map?year=1620&right=high_justice&lang=en&place=office-sierck");
  await page.getByRole("button", { name: "日本語" }).click();
  await expect(page).toHaveURL(/lang=ja/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page.locator("#header h1")).toContainText("ドイツ・バイイ管区");
  await expect(page.getByRole("button", { name: "上級裁判権" })).toHaveAttribute("aria-pressed", "true");
  const panel = page.locator("#panel");
  await expect(panel.locator("h2")).toHaveText("シエルク管区");
  await expect(panel).toContainText("JA シエルク管区");
  await expect(panel.getByRole("button", { name: "ケダンジュ" })).toBeVisible(); // Kédange
});

test("territories: one kind of realm at every level", async ({ page }) => {
  await open(page, "#/territories?year=1620&right=suzerain&lang=en");
  const side = page.locator("#side");
  const menu = side.getByRole("combobox", { name: "Kind of realm" });
  await menu.selectOption("provostship");
  await expect(page).toHaveURL(/kind=provostship/);
  const realms = side.locator("ul.realms li");
  await expect(realms.first()).toContainText("Provostship");
  for (const text of await realms.allInnerTexts()) expect(text).toMatch(/provostship/i);
  await expect(side.getByRole("button", { name: "Rural provostship of Sierck" })).toBeVisible(); // a level-2 realm
  await expect(side.getByRole("button", { name: "Offices", exact: true })).toHaveAttribute("aria-pressed", "false");
  await menu.selectOption("county");
  await expect(side.getByRole("button", { name: "County of Bitche" })).toBeVisible();
  await side.getByRole("button", { name: "Offices", exact: true }).click(); // back to levels
  await expect(page).not.toHaveURL(/kind=/);
});

test("settlements are drawn with one shape per kind of place, keyed in the legend", async ({ page }) => {
  await open(page, "#/map?year=1620&right=suzerain&lang=en");
  const key = page.locator("#legend ul.shapes");
  await expect(page.locator("#legend h3")).toHaveText("Kinds of place");
  for (const kind of ["town", "village", "castle", "abbey", "deserted village", "saltworks"]) {
    await expect(key.getByText(kind, { exact: true })).toBeVisible();
  }
  await expect(key.locator("svg")).toHaveCount(await key.locator("li").count());
  await page.waitForFunction(() => (window as unknown as { __map?: { loaded(): boolean } }).__map?.loaded());
  const images = await page.evaluate(() => {
    const map = (window as unknown as { __map: { hasImage(id: string): boolean } }).__map;
    return ["place-village", "place-castle", "place-deserted_village"].map((id) => map.hasImage(id));
  });
  expect(images).toEqual([true, true, true]);
});
