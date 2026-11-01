import { describe, expect, it } from "vitest";
import {
  clampToWorld,
  decayVelocity,
  fitCircle,
  flightAt,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  screenToWorld,
  visibleRect,
  worldToScreen,
  zoomAt,
} from "@/map/camera";
import { fadeIn, layerWeights, zoomLevel, ZOOM_THRESHOLDS } from "@/map/zoom-levels";

const view = { width: 800, height: 600 };

describe("camera", () => {
  it("converts between world and screen both ways", () => {
    const cam = { x: 100, y: -50, zoom: 2 };
    expect(worldToScreen(cam, view, 100, -50)).toEqual({ x: 400, y: 300 });
    const p = worldToScreen(cam, view, 130, 10);
    expect(screenToWorld(cam, view, p.x, p.y)).toEqual({ x: 130, y: 10 });
  });

  it("keeps the point under the cursor fixed when zooming", () => {
    const cam = { x: 0, y: 0, zoom: 0.5 };
    const before = screenToWorld(cam, view, 650, 120);
    const next = zoomAt(cam, view, 650, 120, 3);
    const after = screenToWorld(next, view, 650, 120);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it("limits zoom from the whole universe to a single name", () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, view, 0, 0, 1e6).zoom).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, view, 0, 0, 1e-9).zoom).toBe(MIN_ZOOM);
    expect(MIN_ZOOM).toBe(0.001);
    expect(MAX_ZOOM).toBe(20);
  });

  it("pans so the content follows the finger", () => {
    const cam = panBy({ x: 0, y: 0, zoom: 2 }, 100, -40);
    expect(cam).toEqual({ x: -50, y: 20, zoom: 2 });
  });

  it("computes the visible world rectangle", () => {
    expect(visibleRect({ x: 10, y: 20, zoom: 2 }, view)).toEqual({
      x0: -190,
      y0: -130,
      x1: 210,
      y1: 170,
    });
  });

  it("stays inside the world", () => {
    const cam = clampToWorld({ x: 3000, y: 4000, zoom: 1 }, 1000);
    expect(Math.hypot(cam.x, cam.y)).toBeCloseTo(1000, 9);
  });

  it("fits a constellation on screen", () => {
    const cam = fitCircle(view, 500, 500, 300, 0);
    expect(cam).toEqual({ x: 500, y: 500, zoom: 1 });
  });

  it("flies from start to end, pulling out on long trips", () => {
    const from = { x: 0, y: 0, zoom: 1 };
    const to = { x: 50_000, y: 0, zoom: 1 };
    expect(flightAt(from, to, view, 0)).toEqual(from);
    expect(flightAt(from, to, view, 1)).toEqual(to);
    expect(flightAt(from, to, view, 0.5).zoom).toBeLessThan(0.05);
    const short = flightAt(from, { x: 100, y: 0, zoom: 2 }, view, 0.5);
    expect(short.zoom).toBeGreaterThanOrEqual(1);
  });

  it("slows inertia down smoothly", () => {
    const v = decayVelocity({ x: 1, y: -2 }, 325);
    expect(v.x).toBeCloseTo(Math.exp(-1), 9);
    expect(v.y).toBeCloseTo(-2 * Math.exp(-1), 9);
  });
});

describe("zoom levels", () => {
  it.each([
    [0.001, "universe"],
    [0.05, "region"],
    [0.5, "constellation"],
    [1.5, "star"],
    [5, "name"],
    [20, "name"],
  ])("zoom %f → %s", (zoom, level) => {
    expect(zoomLevel(zoom)).toBe(level);
  });

  it("fades smoothly around each threshold", () => {
    const t = ZOOM_THRESHOLDS.constellation;
    expect(fadeIn(t / 2, t)).toBe(0);
    expect(fadeIn(t, t)).toBeCloseTo(0.5, 9);
    expect(fadeIn(t * 2, t)).toBe(1);
    expect(fadeIn(t * 1.1, t)).toBeGreaterThan(fadeIn(t * 1.05, t));
  });

  it("shows the spiral image far away and real stars up close, never both at full", () => {
    const far = layerWeights(0.005);
    expect(far.overview).toBe(1);
    expect(far.stars).toBe(0);
    const close = layerWeights(1.5);
    expect(close.stars).toBe(1);
    expect(close.regionDots).toBe(0);
    expect(close.overview).toBeLessThan(0.2);
    expect(layerWeights(5).names).toBe(1);
    expect(layerWeights(1).names).toBe(0);
  });
});
