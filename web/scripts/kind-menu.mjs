// Screenshot the Territories view filtered to one kind of realm, and the kind menu's options:
//   node scripts/kind-menu.mjs <hash> <out.png>
import { chromium } from "playwright";

const [hash, out = "shots/kind.png"] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto(`${process.env.APP_URL}/${hash}`);
await page.waitForSelector("#side h2");
await page.waitForTimeout(Number(process.env.WAIT_MS ?? 5000));
const options = await page.locator("#side label.kind select").evaluate((s) =>
  [...s.querySelectorAll("optgroup")].map((g) => `${g.label}: ${[...g.querySelectorAll("option")].map((o) => o.textContent).join(", ")}`));
console.log(options.join("\n"));
await page.screenshot({ path: out });
await browser.close();
