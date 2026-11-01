import type { Figure } from "./figures";
import { STARS_PER_CONSTELLATION, toWorld, type Placement, type Point } from "./geometry";
import { createRng } from "./random";

export interface Slot {
  /** Fill order: the n-th new star of the constellation takes slot n. */
  slotIndex: number;
  x: number;
  y: number;
  isAnchor: boolean;
  anchorIndex: number | null;
}

/** Lines span this much of the unit disc; the rest is room for the halo. */
const LINE_EXTENT = 0.86;
const LINE_SHARE = 0.7;
const LINE_SPREAD = 0.028;
const HALO_SPREAD = 0.11;
const HALO_ALONG = 0.05;
/** Stars closer than this (unit disc) are resampled, so none sit on top of another. */
const MIN_DISTANCE = 0.016;
const MAX_ATTEMPTS = 40;

/**
 * The 300 positions of a constellation: the figure's anchors, points along its lines and a halo
 * around them, shuffled so the figure appears little by little. Same figure, placement and seed
 * always give the same slots. Coordinates are in world units, rounded to 2 decimals.
 */
export function generateSlots(figure: Figure, placement: Placement, seed: number): Slot[] {
  const rng = createRng(seed, "slots");
  const anchors = normalizeAnchors(figure.anchors);
  const segments = figure.edges.map(([i, j]) => {
    const a = anchors[i];
    const b = anchors[j];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return { a, dx, dy, length: Math.hypot(dx, dy) || 1 };
  });
  const totalLength = segments.reduce((sum, s) => sum + s.length, 0);

  const grid = new PointGrid(MIN_DISTANCE);
  const local: { p: Point; anchorIndex: number | null }[] = anchors.map((p, i) => {
    grid.add(p);
    return { p, anchorIndex: i };
  });

  while (local.length < STARS_PER_CONSTELLATION) {
    let p: Point = { x: 0, y: 0 };
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let t = rng.next() * totalLength;
      let s = segments[segments.length - 1];
      for (const segment of segments) {
        if (t < segment.length) {
          s = segment;
          break;
        }
        t -= segment.length;
      }
      const u = rng.next();
      const halo = rng.next() >= LINE_SHARE;
      const across = rng.gauss() * (halo ? HALO_SPREAD : LINE_SPREAD);
      const along = halo ? rng.gauss() * HALO_ALONG : 0;
      const ux = s.dx / s.length;
      const uy = s.dy / s.length;
      p = {
        x: s.a.x + s.dx * u - uy * across + ux * along,
        y: s.a.y + s.dy * u + ux * across + uy * along,
      };
      // Inside the unit disc and not crowding another star; the last attempt is kept if inside.
      if (Math.hypot(p.x, p.y) > 1) continue;
      if (!grid.isCrowded(p) || attempt === MAX_ATTEMPTS - 1) break;
    }
    if (Math.hypot(p.x, p.y) > 1) continue;
    grid.add(p);
    local.push({ p, anchorIndex: null });
  }

  return rng.shuffle(local).map(({ p, anchorIndex }, slotIndex) => {
    const world = toWorld(p, placement);
    return {
      slotIndex,
      x: round2(world.x),
      y: round2(world.y),
      isAnchor: anchorIndex !== null,
      anchorIndex,
    };
  });
}

/** Centers the figure and scales it so its farthest anchor sits at LINE_EXTENT. */
export function normalizeAnchors(anchors: [number, number][]): Point[] {
  const xs = anchors.map(([x]) => x);
  const ys = anchors.map(([, y]) => y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const reach = Math.max(...anchors.map(([x, y]) => Math.hypot(x - cx, y - cy))) || 1;
  const k = LINE_EXTENT / reach;
  return anchors.map(([x, y]) => ({ x: (x - cx) * k, y: (y - cy) * k }));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Spatial hash for "is there a point closer than d?" checks. */
class PointGrid {
  private cells = new Map<string, Point[]>();
  constructor(private d: number) {}

  private key(cx: number, cy: number) {
    return `${cx},${cy}`;
  }

  add(p: Point) {
    const k = this.key(Math.floor(p.x / this.d), Math.floor(p.y / this.d));
    const cell = this.cells.get(k);
    if (cell) cell.push(p);
    else this.cells.set(k, [p]);
  }

  isCrowded(p: Point): boolean {
    const cx = Math.floor(p.x / this.d);
    const cy = Math.floor(p.y / this.d);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const q of this.cells.get(this.key(cx + dx, cy + dy)) ?? []) {
          if (Math.hypot(p.x - q.x, p.y - q.y) < this.d) return true;
        }
      }
    }
    return false;
  }
}
