// Screenshot the ⓘ pop-up for a right and the About section it links to:
//   node scripts/rights-info.mjs <hash> <prefix>   (VIEWPORT=390x844 for a phone)
import { chromium } from "playwright";

const [hash, prefix = "shots/rights-info"] = process.argv.slice(2);
const [w, h] = (process.env.VIEWPORT ?? "1280x860").split("x").map(Number);
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
await page.goto(`${process.env.APP_URL}/${hash}`);
await page.waitForSelector("#header h1");
await page.waitForTimeout(2000);
await page.click(".right-info summary");
await page.waitForTimeout(300);
await page.screenshot({ path: `${prefix}-popover.png` });
await page.click(".right-info .popover button");
await page.waitForTimeout(600);
await page.screenshot({ path: `${prefix}-about.png` });
console.log(JSON.stringify({ view: await page.evaluate(() => document.body.dataset.view) }));
await browser.close();
