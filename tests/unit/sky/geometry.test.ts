import { describe, expect, it } from "vitest";
import {
  CONSTELLATION_GAP,
  CONSTELLATION_RADIUS,
  constellationPlacement,
  MAX_ROTATION,
  planetOrbitRadius,
  SPIRAL_K,
  spiralPosition,
  spiralRadius,
  UNIT_SPIRAL_MIN_SPACING,
} from "@/sky/geometry";

/** Smallest distance between centers among constellations 1..count (spatial hash). */
function minCenterDistance(count: number): number {
  const cell = 2 * CONSTELLATION_RADIUS + CONSTELLATION_GAP;
  const grid = new Map<string, { x: number; y: number; n: number }[]>();
  const points = Array.from({ length: count }, (_, i) => ({ ...spiralPosition(i + 1), n: i + 1 }));
  for (const p of points) {
    const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
    grid.set(key, [...(grid.get(key) ?? []), p]);
  }
  let min = Infinity;
  for (const p of points) {
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const q of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (q.n > p.n) min = Math.min(min, Math.hypot(p.x - q.x, p.y - q.y));
        }
      }
    }
  }
  return min;
}

describe("spiral", () => {
  it("places constellation n at r = k·√n", () => {
    for (const n of [1, 2, 88, 1000, 10000]) {
      const p = spiralPosition(n);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(SPIRAL_K * Math.sqrt(n), 6);
    }
  });

  it("uses a k large enough for the measured spacing", () => {
    expect(SPIRAL_K * UNIT_SPIRAL_MIN_SPACING).toBeGreaterThanOrEqual(
      2 * CONSTELLATION_RADIUS + CONSTELLATION_GAP,
    );
  });

  it("never lets neighboring constellations touch in the first 10,000", () => {
    expect(minCenterDistance(10000)).toBeGreaterThanOrEqual(
      2 * CONSTELLATION_RADIUS + CONSTELLATION_GAP,
    );
  });

  it("leaves room around the Sun", () => {
    expect(spiralRadius(1) - CONSTELLATION_RADIUS).toBeGreaterThanOrEqual(100);
  });
});

describe("constellation placement", () => {
  it("is reproducible", () => {
    expect(constellationPlacement(23)).toEqual(constellationPlacement(23));
    expect(constellationPlacement(23)).not.toEqual(constellationPlacement(24));
  });

  it("keeps rotation and scale within bounds", () => {
    for (let id = 1; id <= 2000; id++) {
      const p = constellationPlacement(id);
      expect(Math.abs(p.rotation)).toBeLessThanOrEqual(MAX_ROTATION);
      expect(p.scale).toBeLessThanOrEqual(CONSTELLATION_RADIUS);
      expect(p.scale).toBeGreaterThan(0.8 * CONSTELLATION_RADIUS);
    }
  });
});

describe("planet orbits", () => {
  it("falls where constellation threshold / 300 would be", () => {
    expect(planetOrbitRadius(26400)).toBeCloseTo(spiralRadius(88), 6);
    expect(planetOrbitRadius(3000000)).toBeCloseTo(spiralRadius(10000), 6);
  });

  it("grows with the threshold", () => {
    const radii = [1000, 2500, 5000, 10000, 26400, 100000, 300000, 1000000].map(planetOrbitRadius);
    expect([...radii].sort((a, b) => a - b)).toEqual(radii);
    expect(radii[0]).toBeGreaterThan(spiralRadius(1));
  });
});
