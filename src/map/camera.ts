// Camera math for the sky map. Pure: no DOM, no PixiJS.
// zoom = screen pixels per world unit. The camera's (x, y) is the world point at the
// center of the viewport.

export const MIN_ZOOM = 0.001;
export const MAX_ZOOM = 20;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface WorldRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

export function worldToScreen(cam: Camera, view: Viewport, x: number, y: number) {
  return {
    x: (x - cam.x) * cam.zoom + view.width / 2,
    y: (y - cam.y) * cam.zoom + view.height / 2,
  };
}

export function screenToWorld(cam: Camera, view: Viewport, sx: number, sy: number) {
  return {
    x: (sx - view.width / 2) / cam.zoom + cam.x,
    y: (sy - view.height / 2) / cam.zoom + cam.y,
  };
}

/** Zooms to `zoom` keeping the world point under (sx, sy) fixed on screen. */
export function zoomAt(cam: Camera, view: Viewport, sx: number, sy: number, zoom: number): Camera {
  const before = screenToWorld(cam, view, sx, sy);
  const next = { ...cam, zoom: clampZoom(zoom) };
  const after = screenToWorld(next, view, sx, sy);
  return { ...next, x: cam.x + before.x - after.x, y: cam.y + before.y - after.y };
}

/** Moves the camera so the content follows a drag of (dx, dy) screen pixels. */
export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, x: cam.x - dx / cam.zoom, y: cam.y - dy / cam.zoom };
}

/** World rectangle visible on screen, optionally grown by a margin (fraction of its size). */
export function visibleRect(cam: Camera, view: Viewport, margin = 0): WorldRect {
  const w = (view.width / cam.zoom) * (1 + margin);
  const h = (view.height / cam.zoom) * (1 + margin);
  return { x0: cam.x - w / 2, y0: cam.y - h / 2, x1: cam.x + w / 2, y1: cam.y + h / 2 };
}

/** Keeps the camera inside a disc of the given radius around the Sun. */
export function clampToWorld(cam: Camera, radius: number): Camera {
  const d = Math.hypot(cam.x, cam.y);
  if (d <= radius) return cam;
  return { ...cam, x: (cam.x / d) * radius, y: (cam.y / d) * radius };
}

/** Camera that shows the whole disc (cx, cy, r) inside the viewport, with padding in pixels. */
export function fitCircle(view: Viewport, cx: number, cy: number, r: number, padding = 40): Camera {
  const usable = Math.max(1, Math.min(view.width, view.height) - padding * 2);
  return { x: cx, y: cy, zoom: clampZoom(usable / (2 * r)) };
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Camera at time t (0..1) of a flight. Zoom is interpolated in log space and, when the two
 * points are far apart for the current zoom, it pulls out mid-way so the trip stays readable.
 */
export function flightAt(from: Camera, to: Camera, view: Viewport, t: number): Camera {
  if (t <= 0) return { ...from };
  if (t >= 1) return { ...to };
  const e = easeInOutCubic(Math.min(1, Math.max(0, t)));
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const fitBoth = distance > 0 ? Math.min(view.width, view.height) / (distance * 1.4) : Infinity;
  const lowest = Math.min(from.zoom, to.zoom);
  const dip = fitBoth < lowest ? Math.log(lowest) - Math.log(fitBoth) : 0;
  const logZoom =
    Math.log(from.zoom) +
    (Math.log(to.zoom) - Math.log(from.zoom)) * e -
    dip * Math.sin(Math.PI * e);
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
    zoom: clampZoom(Math.exp(logZoom)),
  };
}

/** Flight duration in ms, longer for longer trips, within reason. */
export function flightDuration(from: Camera, to: Camera, view: Viewport): number {
  const screens =
    (Math.hypot(to.x - from.x, to.y - from.y) * Math.min(from.zoom, to.zoom)) /
    Math.max(view.width, 1);
  const zoomChange = Math.abs(Math.log(to.zoom / from.zoom));
  return Math.min(2600, 700 + 260 * Math.log1p(screens) + 180 * zoomChange);
}

/**
 * Inertia after a drag: velocity in screen px/ms decays exponentially.
 * Returns the remaining velocity after dt ms.
 */
export const INERTIA_TIME_CONSTANT = 325;
export function decayVelocity(v: { x: number; y: number }, dt: number) {
  const k = Math.exp(-dt / INERTIA_TIME_CONSTANT);
  return { x: v.x * k, y: v.y * k };
}
