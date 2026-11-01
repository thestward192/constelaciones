// Opens and closes the 3D view many times and checks that memory does not grow, then saves
// screenshots (desktop and phone) to scripts/output/. Needs a running server.
// Usage: npm run measure:viewer -- [--url http://localhost:3000] [--star prueba_rimi5] [--times 20]
import { mkdirSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromium, devices, type Page } from "@playwright/test";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3000" },
    star: { type: "string", default: "prueba_rimi5" },
    times: { type: "string", default: "20" },
  },
});
const TIMES = Number(values.times);
mkdirSync("scripts/output", { recursive: true });

const browser = await chromium.launch({
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--js-flags=--expose-gc"],
});

async function openStar(page: Page) {
  await page.goto(`${values.url}/@${values.star}`);
  await page.getByRole("button", { name: "Ver mi estrella en 3D" }).waitFor({ timeout: 60_000 });
}

async function open3D(page: Page) {
  await page.getByRole("button", { name: "Ver mi estrella en 3D" }).click();
  const dialog = page.getByRole("dialog", { name: "Vista 3D" });
  await dialog.locator("canvas").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(400);
  return dialog;
}

async function heapMB(page: Page) {
  return page.evaluate(async () => {
    const w = window as unknown as { gc?: () => void };
    for (let i = 0; i < 3; i++) {
      w.gc?.();
      await new Promise((r) => setTimeout(r, 100));
    }
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return memory ? memory.usedJSHeapSize / 1048576 : NaN;
  });
}

// ---------------------------------------------------------------- memory
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" || m.text().includes("GL_INVALID")) errors.push(m.text().slice(0, 160));
});
await openStar(page);

// First open downloads three.js and warms caches; measure from after it.
let dialog = await open3D(page);
await dialog.getByRole("button", { name: "Cerrar vista 3D" }).click();
await page.waitForTimeout(500);
const before = await heapMB(page);
const samples: number[] = [];
for (let i = 0; i < TIMES; i++) {
  dialog = await open3D(page);
  await dialog.getByRole("button", { name: "Cerrar vista 3D" }).click();
  await dialog.waitFor({ state: "detached" });
  if ((i + 1) % 5 === 0) samples.push(Math.round((await heapMB(page)) * 10) / 10);
}
const after = await heapMB(page);
const canvases = await page.locator("canvas").count();

// ---------------------------------------------------------------- screenshots
dialog = await open3D(page);
await page.waitForTimeout(1500);
await page.screenshot({ path: "scripts/output/viewer-desktop.png" });
await dialog.getByRole("button", { name: /Supernova/ }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: "scripts/output/viewer-desktop-supernova.png" });
await dialog.getByRole("button", { name: "Cerrar vista 3D" }).click();

const phone = await browser.newPage({ ...devices["Pixel 7"] });
await openStar(phone);
await open3D(phone);
await phone.waitForTimeout(1500);
await phone.screenshot({ path: "scripts/output/viewer-phone.png" });

console.log(
  JSON.stringify(
    {
      opens: TIMES,
      heapBeforeMB: Math.round(before * 10) / 10,
      heapAfterMB: Math.round(after * 10) / 10,
      every5: samples,
      canvasesAfterClosing: canvases,
      errors: [...new Set(errors)],
    },
    null,
    2,
  ),
);
await browser.close();
