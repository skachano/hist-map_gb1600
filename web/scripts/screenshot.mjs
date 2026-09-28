// Screenshot the running app: node scripts/screenshot.mjs <hash> <out.png> [key ...]
//   e.g. node scripts/screenshot.mjs "#/map?year=1600&right=suzerain" shots/a.png ArrowRight
import { chromium } from "playwright";

const [hash = "", out = "shots/screenshot.png", ...keys] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const [w, h] = (process.env.VIEWPORT ?? "1280x860").split("x").map(Number);
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${process.env.APP_URL ?? "http://localhost:5173"}/${hash}`);
try {
  await page.waitForSelector("#header h1", { state: "attached", timeout: 30000 });
} catch (e) {
  await page.screenshot({ path: out });
  console.log(JSON.stringify({ failed: String(e).split("\n")[0], body: (await page.textContent("body"))?.slice(0, 300), errors }));
  process.exit(1);
}
await page.waitForTimeout(Number(process.env.WAIT_MS ?? 2500)); // map tiles and layers
for (const key of keys) {
  await page.keyboard.press(key);
  await page.waitForTimeout(400);
}
await page.screenshot({ path: out });
console.log(JSON.stringify({ url: page.url(), view: await page.evaluate(() => document.body.dataset.view), errors }));
await browser.close();
