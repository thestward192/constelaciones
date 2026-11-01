// Draws the first N constellations of the spiral to PNG for visual review.
// Usage: npm run render:spiral -- [count]   (default 200)
// Output: scripts/output/spiral-{count}.png (whole spiral) and spiral-center.png (detail).
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { readFigures } from "./db/runner";
import {
  chooseFigure,
  constellationPlacement,
  createRng,
  generateSlots,
  normalizeAnchors,
  planetOrbitRadius,
  spiralRadius,
  toWorld,
  varyFigure,
  CONSTELLATION_RADIUS,
} from "../src/sky";

const count = Number(process.argv[2] ?? 200);
const outDir = join(import.meta.dirname, "output");
mkdirSync(outDir, { recursive: true });

const figures = readFigures();
const PLANETS = [
  ["Mercurio", 1000],
  ["Venus", 2500],
  ["Tierra", 5000],
  ["Marte", 10000],
  ["Júpiter", 26400],
  ["Saturno", 100000],
  ["Urano", 300000],
  ["Neptuno", 1000000],
] as const;

const constellations = Array.from({ length: count }, (_, i) => {
  const id = i + 1;
  const choice = chooseFigure(id, figures.length);
  const base = figures[choice.index];
  const figure = choice.varied ? varyFigure(base, createRng(id, "vary")) : base;
  const placement = constellationPlacement(id);
  const anchors = normalizeAnchors(figure.anchors).map((p) => toWorld(p, placement));
  return { id, figure, placement, anchors, slots: generateSlots(figure, placement, id) };
});

// Renders the world disc of the given radius (around the Sun) to a square SVG of `size` px.
function svg(worldRadius: number, size: number, detail: boolean): string {
  const k = size / 2 / worldRadius;
  const X = (x: number) => (size / 2 + x * k).toFixed(1);
  const Y = (y: number) => (size / 2 + y * k).toFixed(1);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`,
    `<defs><radialGradient id="bg"><stop offset="0" stop-color="#0b1326"/><stop offset="1" stop-color="#050813"/></radialGradient>`,
    `<radialGradient id="sun"><stop offset="0" stop-color="#fff6dc"/><stop offset=".35" stop-color="#e8cb8f"/><stop offset="1" stop-color="#e8cb8f" stop-opacity="0"/></radialGradient></defs>`,
    `<rect width="100%" height="100%" fill="url(#bg)"/>`,
  ];

  for (const [name, threshold] of PLANETS) {
    const r = planetOrbitRadius(threshold);
    if (r > worldRadius * 1.4) continue;
    parts.push(
      `<circle cx="${X(0)}" cy="${Y(0)}" r="${(r * k).toFixed(1)}" fill="none" stroke="rgba(190,202,230,.22)" stroke-width="1" stroke-dasharray="4 6"/>`,
      `<text x="${X(r * 0.707 + 20)}" y="${Y(-r * 0.707)}" fill="#6d7892" font-family="sans-serif" font-size="${detail ? 22 : 18}">${name}</text>`,
    );
  }

  const sunR = Math.max(90 * k, 6);
  parts.push(`<circle cx="${X(0)}" cy="${Y(0)}" r="${(sunR * 2.2).toFixed(1)}" fill="url(#sun)"/>`);

  const starR = detail ? 1.6 : 0.7;
  for (const c of constellations) {
    const { x, y, scale } = c.placement;
    if (Math.hypot(x, y) - scale > worldRadius * 1.42) continue;
    if (detail) {
      parts.push(
        `<circle cx="${X(x)}" cy="${Y(y)}" r="${(CONSTELLATION_RADIUS * k).toFixed(1)}" fill="none" stroke="rgba(157,195,255,.12)"/>`,
      );
    }
    for (const [i, j] of c.figure.edges) {
      const a = c.anchors[i];
      const b = c.anchors[j];
      parts.push(
        `<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="rgba(232,203,143,.55)" stroke-width="${detail ? 1.2 : 0.8}"/>`,
      );
    }
    for (const s of c.slots) {
      parts.push(`<circle cx="${X(s.x)}" cy="${Y(s.y)}" r="${starR}" fill="#eceff6"/>`);
    }
    const label = detail ? `${c.id} · ${c.figure.name}` : String(c.id);
    parts.push(
      `<text x="${X(x)}" y="${(Number(Y(y + scale)) + (detail ? 22 : 12)).toFixed(1)}" text-anchor="middle" fill="#a3adc4" font-family="monospace" font-size="${detail ? 16 : 11}">${label}</text>`,
    );
  }

  parts.push("</svg>");
  return parts.join("");
}

const overviewRadius = spiralRadius(count) + CONSTELLATION_RADIUS + 200;
await sharp(Buffer.from(svg(overviewRadius, 2400, false)))
  .png()
  .toFile(join(outDir, `spiral-${count}.png`));
await sharp(Buffer.from(svg(spiralRadius(14) + CONSTELLATION_RADIUS + 150, 2000, true)))
  .png()
  .toFile(join(outDir, "spiral-center.png"));

console.log(`Listo: ${join(outDir, `spiral-${count}.png`)} y spiral-center.png`);
