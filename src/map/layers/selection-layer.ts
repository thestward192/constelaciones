import { Container, Graphics } from "pixi.js";
import { worldToScreen } from "../camera";
import type { FrameState } from "../frame";
import { COLORS, starScreenRadius } from "../style";

export interface Selection {
  x: number;
  y: number;
  level: number;
  /** Positions joined to the star by light threads (who invited it and whom it invited). */
  threads: { x: number; y: number }[];
}

const PULSE_SECONDS = 1.6;
const SEGMENTS = 24;
const BANDS = 6;

/**
 * The selected star: a gold circle with a pulse that expands, and golden curves (light threads)
 * to the star that invited it and to the ones it invited, fading toward the far end.
 */
export class SelectionLayer {
  readonly screen = new Container();
  private threads = new Graphics();
  private ring = new Graphics();
  private selection: Selection | null = null;
  private since = 0;

  constructor() {
    this.screen.addChild(this.threads, this.ring);
  }

  set(selection: Selection | null, time: number) {
    this.selection = selection;
    this.since = time;
  }

  get current() {
    return this.selection;
  }

  update(frame: FrameState) {
    this.threads.clear();
    this.ring.clear();
    const s = this.selection;
    if (!s) return;
    const { cam, view } = frame;
    const p = worldToScreen(cam, view, s.x, s.y);

    // Threads in screen space: quadratic curves bowed upward, as in the prototype, fading toward
    // the far end. Segments are grouped into a few opacity bands: one stroke per band, not per segment.
    const curves = s.threads.map((t) => {
      const q = worldToScreen(cam, view, t.x, t.y);
      return {
        q,
        mx: (p.x + q.x) / 2,
        my: (p.y + q.y) / 2 - Math.hypot(q.x - p.x, q.y - p.y) * 0.18,
      };
    });
    const point = (c: (typeof curves)[number], u: number) => ({
      x: (1 - u) ** 2 * p.x + 2 * (1 - u) * u * c.mx + u * u * c.q.x,
      y: (1 - u) ** 2 * p.y + 2 * (1 - u) * u * c.my + u * u * c.q.y,
    });
    for (let band = 0; band < BANDS; band++) {
      if (!curves.length) break;
      for (const c of curves) {
        for (let i = 0; i < SEGMENTS / BANDS; i++) {
          const u0 = (band * (SEGMENTS / BANDS) + i) / SEGMENTS;
          const a0 = point(c, u0);
          const a1 = point(c, u0 + 1 / SEGMENTS);
          this.threads.moveTo(a0.x, a0.y).lineTo(a1.x, a1.y);
        }
      }
      this.threads.stroke({
        width: 1,
        color: COLORS.gold,
        alpha: 0.75 - (0.63 * (band + 0.5)) / BANDS,
      });
    }

    const r = starScreenRadius(s.level, cam.zoom) + 8;
    this.ring.circle(p.x, p.y, r).stroke({ width: 1.2, color: COLORS.gold, alpha: 0.9 });
    if (!frame.reducedMotion) {
      const phase = ((frame.time - this.since) % PULSE_SECONDS) / PULSE_SECONDS;
      this.ring
        .circle(p.x, p.y, r + phase * 26)
        .stroke({ width: 1.2, color: COLORS.gold, alpha: 0.6 * (1 - phase) });
    }
  }
}
