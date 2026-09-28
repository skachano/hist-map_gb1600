// Hover and click at a place's coordinates: node scripts/probe-place.mjs <hash> <lon> <lat> [zoom]
import { chromium } from "playwright";
const [hash, lon, lat, zoom] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto(`${process.env.APP_URL}/${hash}`);
await page.waitForSelector("#header h1");
await page.waitForFunction(() => window.__map?.loaded());
if (zoom) {
  await page.evaluate(([x, y, z]) => window.__map.jumpTo({ center: [x, y], zoom: z }), [Number(lon), Number(lat), Number(zoom)]);
  await page.waitForTimeout(1500);
}
const pt = await page.evaluate(([x, y]) => {
  const p = window.__map.project([x, y]); const r = document.getElementById("map").getBoundingClientRect();
  return { x: p.x + r.left, y: p.y + r.top };
}, [Number(lon), Number(lat)]);
const under = await page.evaluate(([x, y]) => window.__map.queryRenderedFeatures([x, y], { layers: ["terr-fill"] })
  .map((f) => `${f.properties.id}(${f.properties.settlements})`), [pt.x - (await page.evaluate(() => document.getElementById("map").getBoundingClientRect().left)), pt.y - (await page.evaluate(() => document.getElementById("map").getBoundingClientRect().top))]);
await page.mouse.move(pt.x, pt.y);
await page.waitForTimeout(400);
const tooltip = await page.locator("#tooltip").innerText().catch(() => "");
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(600);
const panel = await page.locator("#panel h2").innerText().catch(() => "(no panel)");
console.log(JSON.stringify({ under, tooltip: tooltip.replace(/\n/g, " | "), panel }));
await page.screenshot({ path: "shots/probe-place.png" });
await browser.close();
