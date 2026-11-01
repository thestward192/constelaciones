import sharp from "sharp";
import { CONSTELLATION_RADIUS } from "../../sky";

export interface OverviewConstellation {
  x: number;
  y: number;
  r: number;
  count: number;
  complete: boolean;
}

export const OVERVIEW_SIZE = 2048;

// Complete constellations glow cold white, the forming one in gold (the accent).
const COMPLETE = [220, 230, 255];
const FORMING = [232, 203, 143];
/** Below a few pixels a glow vanishes; keep every constellation visible. */
const MIN_GLOW_PX = 4;
/** Glows reach beyond the constellation so neighbors melt into one cloud. */
const GLOW_REACH = 2;
/** Box blur radius and passes (≈ gaussian): a cloud, not a grid of dots, and a light file. */
const BLUR_RADIUS = 2;
const BLUR_PASSES = 3;

/**
 * The whole spiral as a cloud of light, for the "Universo" zoom level: one soft glow per
 * constellation, no individual stars. Opaque WebP on black, centered on the Sun, covering the
 * square [-radius, radius] in world units on both axes. The map must draw it with additive
 * blending: black adds no light, so it looks transparent, and an opaque image compresses far
 * better than one with an alpha channel.
 *
 * White and gold light are accumulated separately in float buffers, softened and tone-mapped.
 */
export async function renderOverview(
  constellations: OverviewConstellation[],
): Promise<{ image: Buffer; radius: number }> {
  const radius =
    Math.max(CONSTELLATION_RADIUS * 3, ...constellations.map((c) => Math.hypot(c.x, c.y) + c.r)) +
    CONSTELLATION_RADIUS;
  const size = OVERVIEW_SIZE;
  const k = size / 2 / radius;
  const white = new Float32Array(size * size);
  const gold = new Float32Array(size * size);

  for (const c of constellations) {
    const cx = size / 2 + c.x * k;
    const cy = size / 2 + c.y * k;
    const r = Math.max(c.r * GLOW_REACH * k, MIN_GLOW_PX);
    // The outer, newest rings fade a little, which gives the spiral depth.
    const fade = 1 - 0.35 * (Math.hypot(c.x, c.y) / radius);
    const strength = (c.complete ? 0.9 : 0.6 + 0.5 * (c.count / 300)) * fade;
    const target = c.complete ? white : gold;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(size - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(size - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const d2 = (dx * dx + dy * dy) / (r * r);
        if (d2 >= 1) continue;
        const fall = 1 - Math.sqrt(d2);
        target[y * size + x] += strength * fall * fall;
      }
    }
  }

  for (let pass = 0; pass < BLUR_PASSES; pass++) {
    boxBlur(white, size, BLUR_RADIUS);
    boxBlur(gold, size, BLUR_RADIUS);
  }

  const rgb = Buffer.alloc(size * size * 3);
  for (let p = 0; p < size * size; p++) {
    const total = white[p] + gold[p];
    if (total <= 0) continue;
    const light = 1 - Math.exp(-total);
    const t = gold[p] / total;
    for (let ch = 0; ch < 3; ch++) {
      rgb[p * 3 + ch] = Math.round((COMPLETE[ch] + (FORMING[ch] - COMPLETE[ch]) * t) * light);
    }
  }

  const image = await sharp(rgb, { raw: { width: size, height: size, channels: 3 } })
    .webp({ quality: 70, effort: 6 })
    .toBuffer();
  return { image, radius };
}

/** In-place separable box blur of a square float image. */
function boxBlur(data: Float32Array, size: number, r: number) {
  const line = new Float32Array(size);
  const width = 2 * r + 1;
  for (let pass = 0; pass < 2; pass++) {
    const horizontal = pass === 0;
    for (let a = 0; a < size; a++) {
      const at = (b: number) => (horizontal ? a * size + b : b * size + a);
      let sum = 0;
      for (let b = -r; b <= r; b++) sum += data[at(Math.min(size - 1, Math.max(0, b)))];
      for (let b = 0; b < size; b++) {
        line[b] = sum / width;
        sum += data[at(Math.min(size - 1, b + r + 1))] - data[at(Math.max(0, b - r))];
      }
      for (let b = 0; b < size; b++) data[at(b)] = line[b];
    }
  }
}
