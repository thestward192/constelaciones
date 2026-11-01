import { createRng } from "./random";

// Map geometry (docs/constelaciones-implementacion.md, section 5).
// World units; the Sun is at (0, 0) and y grows downward.

export const STARS_PER_CONSTELLATION = 300;

/** No star is farther than this from its constellation center. */
export const CONSTELLATION_RADIUS = 300;
/** Minimum empty space between the discs of two neighboring constellations. */
export const CONSTELLATION_GAP = 40;

/** π(3 − √5) ≈ 137.508°. The exact value keeps the spiral evenly spaced forever. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Smallest distance between two points of the unit spiral (r = √n, θ = n·GOLDEN_ANGLE).
 * It is reached by points 1 and 4 and never gets smaller (checked up to n = 300,000).
 */
export const UNIT_SPIRAL_MIN_SPACING = 1.60195;

/** k in r = k·√n, the smallest round value that keeps neighbors apart. */
export const SPIRAL_K = 400;

/** Figures are rotated at most this much, so they stay recognizable. */
export const MAX_ROTATION = (30 * Math.PI) / 180;
export const MIN_SCALE = 0.82 * CONSTELLATION_RADIUS;
export const MAX_SCALE = CONSTELLATION_RADIUS;

export interface Point {
  x: number;
  y: number;
}

export interface Placement extends Point {
  /** Radians, clockwise on screen. */
  rotation: number;
  /** Radius in world units of the constellation's stars (≤ CONSTELLATION_RADIUS). */
  scale: number;
}

/** Distance from the Sun of the n-th position of the spiral (n may be fractional). */
export function spiralRadius(n: number): number {
  return SPIRAL_K * Math.sqrt(n);
}

/** Center of constellation n (1, 2, 3...) on the golden spiral around the Sun. */
export function spiralPosition(n: number): Point {
  const r = spiralRadius(n);
  const theta = n * GOLDEN_ANGLE;
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
}

/** Center, rotation and scale of a constellation. Reproducible: seeded with its id. */
export function constellationPlacement(id: number): Placement {
  const rng = createRng(id, "placement");
  return {
    ...spiralPosition(id),
    rotation: rng.range(-MAX_ROTATION, MAX_ROTATION),
    scale: rng.range(MIN_SCALE, MAX_SCALE),
  };
}

/** A planet orbits where constellation number threshold / 300 would fall. */
export function planetOrbitRadius(threshold: number): number {
  return spiralRadius(threshold / STARS_PER_CONSTELLATION);
}

/** Maps a point of the unit disc of a constellation to world coordinates. */
export function toWorld(local: Point, placement: Placement): Point {
  const cos = Math.cos(placement.rotation);
  const sin = Math.sin(placement.rotation);
  return {
    x: placement.x + (local.x * cos - local.y * sin) * placement.scale,
    y: placement.y + (local.x * sin + local.y * cos) * placement.scale,
  };
}
