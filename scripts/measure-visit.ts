// Weight of a typical visit on a phone: open the page, search a star, open the 3D view.
// Also runs Lighthouse (mobile profile) on the public page. Needs a production server
// (npm run build && npm start -- -p 3300).
// Usage: npm run measure:visit -- [--url http://localhost:3300] [--search prueba_r] [--runs 3]
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromium, devices } from "@playwright/test";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3300" },
    search: { type: "string", default: "prueba_r" },
    runs: { type: "string", default: "3" },
    label: { type: "string", default: "real" },
  },
});
const base = values.url!.replace(/\/$/, "");
mkdirSync("scripts/output", { recursive: true });

// ---------------------------------------------------------------- typical visit

const browser = await chromium.launch({
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({ ...devices["Pixel 7"] });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

let bytes = 0;
const byType: Record<string, number> = {};
const types = new Map<string, string>();
cdp.on("Network.responseReceived", (e) => types.set(e.requestId, e.type));
cdp.on("Network.loadingFinished", (e) => {
  bytes += e.encodedDataLength;
  const type = types.get(e.requestId) ?? "Other";
  byType[type] = (byType[type] ?? 0) + e.encodedDataLength;
});
const kb = (n: number) => Math.round(n / 1024);

const steps: { step: string; kb: number }[] = [];
let last = 0;
const mark = (step: string) => {
  steps.push({ step, kb: kb(bytes - last) });
  last = bytes;
};

await page.goto(`${base}/`, { waitUntil: "load" });
const box = page.getByRole("combobox", { name: /Busca tu estrella/ });
await box.waitFor({ timeout: 60_000 });
await page.waitForTimeout(5000); // first constellation files, fonts
mark("Entrar");

await box.click();
await box.fill(values.search!);
const first = page.locator("#search-suggestions button").first();
await first.waitFor({ timeout: 20_000 });
await first.click();
await page.getByRole("article", { name: "Detalle" }).waitFor({ timeout: 20_000 });
await page.waitForTimeout(4000); // the trip and the constellation of the star
mark("Buscar y abrir su estrella");

await page
  .getByRole("article", { name: "Detalle" })
  .getByRole("button", { name: "Ver mi estrella en 3D" })
  .click();
await page.getByRole("dialog", { name: "Vista 3D" }).locator("canvas").waitFor({ timeout: 30_000 });
await page.waitForTimeout(3000);
mark("Abrir la vista 3D");
await browser.close();

const visitKb = kb(bytes);
const byTypeKb = Object.fromEntries(Object.entries(byType).map(([t, n]) => [t, kb(n)]));
console.log(`Visit (${values.label}): ${visitKb} KB`, steps, byTypeKb);

// ---------------------------------------------------------------- Lighthouse

const chrome = await chromeLauncher.launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ["--headless=new", "--enable-unsafe-swiftshader"],
});
const runs: {
  performance: number;
  lcp: number;
  tbt: number;
  cls: number;
  fcp: number;
  si: number;
}[] = [];
try {
  for (let i = 0; i < Number(values.runs); i++) {
    const result = await lighthouse(`${base}/`, {
      port: chrome.port,
      onlyCategories: ["performance"],
      output: "html",
      logLevel: "error",
    });
    if (!result) throw new Error("Lighthouse returned nothing.");
    const { lhr } = result;
    const audit = (id: string) => Math.round(lhr.audits[id].numericValue ?? 0);
    runs.push({
      performance: Math.round((lhr.categories.performance.score ?? 0) * 100),
      fcp: audit("first-contentful-paint"),
      lcp: audit("largest-contentful-paint"),
      tbt: audit("total-blocking-time"),
      cls: Math.round((lhr.audits["cumulative-layout-shift"].numericValue ?? 0) * 1000) / 1000,
      si: audit("speed-index"),
    });
    if (i === 0) {
      writeFileSync(`scripts/output/lighthouse-${values.label}.html`, result.report as string);
    }
    console.log(`Lighthouse run ${i + 1}:`, runs.at(-1));
  }
} finally {
  chrome.kill();
}
const median = [...runs].sort((a, b) => a.performance - b.performance)[Math.floor(runs.length / 2)];

const report = { label: values.label, visitKb, steps, byTypeKb, lighthouse: { median, runs } };
writeFileSync(`scripts/output/visit-${values.label}.json`, JSON.stringify(report, null, 2));
console.log(`Lighthouse median performance: ${median.performance}`);
