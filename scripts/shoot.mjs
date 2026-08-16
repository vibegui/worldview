// Screenshot the running demo, one PNG per nav tab.
//
// Not part of the product: a way to actually look at the thing instead of
// asserting that tool payloads were well shaped and calling that "it renders".
// Run it against `bun run demo`:
//
//   node scripts/shoot.mjs [baseUrl] [password] [outDir]
//
// Playwright is not a dependency of this repo; point NODE_PATH at any checkout
// that has it, e.g.
//   NODE_PATH=~/Projects/vibegui.com/node_modules node scripts/shoot.mjs

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = process.argv[2] ?? "http://localhost:8787";
const password = process.argv[3] ?? "demo";
const outDir = process.argv[4] ?? ".context/shots";

const TABS = [
  "Declaration",
  "Analytics",
  "Projects",
  "Goals",
  "Inbox",
  "Bookmarks",
  "Memory",
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const problems = [];
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));

await page.goto(base, { waitUntil: "domcontentloaded" });
await page.fill('input[name="password"]', password);
await page.click('button[type="submit"]');
await page.waitForSelector("nav.nav button", { timeout: 15000 });

for (const tab of TABS) {
  await page.click(`nav.nav button:text-is("${tab}")`);
  // The view swaps once the tool call resolves; there is no explicit ready
  // signal, so settle on the network instead.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);

  const file = `${outDir}/${tab.toLowerCase()}.png`;
  await page.screenshot({ path: file, fullPage: true });

  // A view that fell through to JsonFallback is a view that did not render.
  const raw = await page.locator("pre").count();
  const empty = await page.locator(".empty").count();
  console.log(
    `${tab.padEnd(12)} ${file}${raw ? "  RAW JSON FALLBACK" : ""}${empty ? "  EMPTY STATE" : ""}`,
  );
}

await browser.close();
if (problems.length) {
  console.log(`\n${problems.length} console problem(s):`);
  for (const problem of [...new Set(problems)].slice(0, 12)) {
    console.log(`  ${problem}`);
  }
}
