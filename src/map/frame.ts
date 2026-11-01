import type { Camera, Viewport, WorldRect } from "./camera";
import type { LayerWeights } from "./zoom-levels";

/** Everything a layer needs to draw one frame. */
export interface FrameState {
  cam: Camera;
  view: Viewport;
  /** Visible world rectangle (with a small margin). */
  rect: WorldRect;
  weights: LayerWeights;
  /** Seconds since the map started. */
  time: number;
  /** Seconds since the last frame. */
  dt: number;
  reducedMotion: boolean;
  /** Current day of the challenge (constellations completed today are "today's"). */
  today: number | null;
  /** True when the camera moved since the last frame. */
  moved: boolean;
}

/** Font families resolved from the page's CSS variables (next/font generates the names). */
export interface Fonts {
  display: string;
  body: string;
  mono: string;
}

export function resolveFonts(): Fonts {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    display: read("--font-display", "Georgia, serif"),
    body: read("--font-body", "system-ui, sans-serif"),
    mono: read("--font-mono", "monospace"),
  };
}

/** Small stable hash for per-star randomness (twinkle phase and speed). */
export function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}
