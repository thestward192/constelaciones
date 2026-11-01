// Measures the 2D map like a mid-range phone: frames per second at the constellation zoom while
// moving, and bytes downloaded on the first load. Needs a running server (default :3300).
// Usage: npm run measure:map -- [--url http://localhost:3300/] [--throttle 4]
import { parseArgs } from "node:util";
import { chromium, devices } from "@playwright/test";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3300/" },
    throttle: { type: "string", default: "4" },
  },
});

const browser = await chromium.launch({
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({ ...devices["Pixel 7"] });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(values.throttle) });

let bytes = 0;
const byType: Record<string, number> = {};
const types = new Map<string, string>();
cdp.on("Network.responseReceived", (e) => types.set(e.requestId, e.type));
cdp.on("Network.loadingFinished", (e) => {
  bytes += e.encodedDataLength;
  const type = types.get(e.requestId) ?? "Other";
  byType[type] = (byType[type] ?? 0) + e.encodedDataLength;
});

await page.goto(values.url!, { waitUntil: "load" });
await page.waitForFunction(
  () => document.querySelector("canvas") && !document.body.innerText.includes("Cargando el cielo"),
  null,
  {
    timeout: 60_000,
  },
);
if (await page.getByText("No se pudo cargar el cielo").count())
  throw new Error("The map shows its error message: nothing to measure.");
await page.waitForTimeout(4000); // initial constellation files and fonts
const initialBytes = bytes;
await page.screenshot({ path: "scripts/output/measure-start.png" });
const initialByType = { ...byType };

const gpu = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  return info ? gl!.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown";
});

// Wide constellation zoom (many stars on screen), then pan continuously while measuring.
const box = page.viewportSize()!;
await page.mouse.move(box.width / 2, box.height / 2);
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(150);
}
await page.waitForTimeout(3500);

// Passed as a string: tsx would inject helpers that do not exist in the page.
const result = (await page.evaluate(`(async () => {
  const frames = [];
  let last = performance.now();
  const start = last;
  const canvas = document.querySelector("canvas");
  const rect = canvas.getBoundingClientRect();
  let x = rect.width / 2;
  const y = rect.height / 2;
  const fire = (type) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true }));
  fire("pointerdown");
  await new Promise((resolve) => {
    requestAnimationFrame(function step(now) {
      frames.push(now - last);
      last = now;
      x += 2;
      fire("pointermove");
      if (now - start < 5000) requestAnimationFrame(step);
      else resolve();
    });
  });
  fire("pointerup");
  const sorted = [...frames].sort((p, q) => p - q);
  return { fps: (frames.length * 1000) / 5000, p95FrameMs: sorted[Math.floor(sorted.length * 0.95)] };
})()`)) as { fps: number; p95FrameMs: number };

console.log(
  JSON.stringify(
    {
      gpu,
      throttle: values.throttle,
      initialKB: Math.round(initialBytes / 1024),
      initialByType: Object.fromEntries(
        Object.entries(initialByType).map(([k, v]) => [k, Math.round(v / 1024)]),
      ),
      fps: result.fps,
      p95FrameMs: Math.round(result.p95FrameMs * 10) / 10,
    },
    null,
    2,
  ),
);
await page.screenshot({ path: "scripts/output/measure-end.png" });
await browser.close();
