import { decayVelocity, panBy, zoomAt, type Camera, type Viewport } from "./camera";

export interface InputTarget {
  camera(): Camera;
  viewport(): Viewport;
  /** Direct camera change from a gesture (cancels any flight). */
  setCamera(cam: Camera): void;
  /** Animated change (double tap, keyboard zoom). */
  flyTo(cam: Camera): void;
  reducedMotion(): boolean;
  /** A tap without dragging, in screen coordinates. */
  onTap?(x: number, y: number): void;
}

const TAP_SLOP = 6;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_ZOOM = 2.2;
const MIN_INERTIA_SPEED = 0.05; // px/ms

/**
 * Gestures on the map: drag with inertia, wheel zoom toward the cursor, pinch, double tap,
 * and keyboard (+ / − / arrows) for people who do not use a pointer.
 */
export class MapInput {
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { distance: number; mid: { x: number; y: number } } | null = null;
  private samples: { t: number; x: number; y: number }[] = [];
  private velocity: { x: number; y: number } | null = null;
  private downAt: { x: number; y: number; t: number } | null = null;
  private moved = false;
  private lastTap: { x: number; y: number; t: number } | null = null;

  constructor(
    private element: HTMLElement,
    private target: InputTarget,
  ) {
    element.style.touchAction = "none";
    element.addEventListener("pointerdown", this.down);
    element.addEventListener("pointermove", this.move);
    element.addEventListener("pointerup", this.up);
    element.addEventListener("pointercancel", this.up);
    element.addEventListener("wheel", this.wheel, { passive: false });
    element.addEventListener("keydown", this.key);
  }

  destroy() {
    this.element.removeEventListener("pointerdown", this.down);
    this.element.removeEventListener("pointermove", this.move);
    this.element.removeEventListener("pointerup", this.up);
    this.element.removeEventListener("pointercancel", this.up);
    this.element.removeEventListener("wheel", this.wheel);
    this.element.removeEventListener("keydown", this.key);
  }

  /** Advances inertia; call every frame with the elapsed milliseconds. */
  step(dtMs: number) {
    if (!this.velocity) return;
    this.target.setCamera(
      panBy(this.target.camera(), this.velocity.x * dtMs, this.velocity.y * dtMs),
    );
    this.velocity = decayVelocity(this.velocity, dtMs);
    if (Math.hypot(this.velocity.x, this.velocity.y) < 0.01) this.velocity = null;
  }

  stopInertia() {
    this.velocity = null;
  }

  private local(e: PointerEvent | WheelEvent) {
    const rect = this.element.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private down = (e: PointerEvent) => {
    this.element.setPointerCapture(e.pointerId);
    this.element.style.cursor = "grabbing";
    this.velocity = null;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      this.downAt = { ...p, t: performance.now() };
      this.moved = false;
      this.samples = [{ t: performance.now(), ...p }];
    } else {
      this.moved = true; // two fingers: never a tap
      this.pinch = this.pinchState();
    }
  };

  private move = (e: PointerEvent) => {
    const previous = this.pointers.get(e.pointerId);
    if (!previous) return;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);

    if (this.pointers.size >= 2 && this.pinch) {
      const next = this.pinchState();
      const view = this.target.viewport();
      let cam = this.target.camera();
      cam = zoomAt(
        cam,
        view,
        next.mid.x,
        next.mid.y,
        (cam.zoom * next.distance) / this.pinch.distance,
      );
      cam = panBy(cam, next.mid.x - this.pinch.mid.x, next.mid.y - this.pinch.mid.y);
      this.target.setCamera(cam);
      this.pinch = next;
      return;
    }

    if (this.downAt && Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) > TAP_SLOP)
      this.moved = true;
    if (!this.moved) return;
    this.target.setCamera(panBy(this.target.camera(), p.x - previous.x, p.y - previous.y));
    const now = performance.now();
    this.samples.push({ t: now, ...p });
    while (this.samples.length > 2 && now - this.samples[0].t > 100) this.samples.shift();
  };

  private up = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.local(e);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 1) {
      // Pinch ended with one finger left: continue as a drag from there.
      const [remaining] = this.pointers.values();
      this.samples = [{ t: performance.now(), ...remaining }];
      this.pinch = null;
      return;
    }
    if (this.pointers.size > 0) return;
    this.element.style.cursor = "grab";
    this.pinch = null;

    if (!this.moved) {
      this.tap(p);
    } else if (!this.target.reducedMotion() && this.samples.length >= 2) {
      const first = this.samples[0];
      const last = this.samples[this.samples.length - 1];
      const dt = Math.max(1, last.t - first.t);
      const v = { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
      if (performance.now() - last.t < 60 && Math.hypot(v.x, v.y) > MIN_INERTIA_SPEED)
        this.velocity = v;
    }
    this.downAt = null;
  };

  private tap(p: { x: number; y: number }) {
    const now = performance.now();
    const last = this.lastTap;
    if (last && now - last.t < DOUBLE_TAP_MS && Math.hypot(p.x - last.x, p.y - last.y) < 30) {
      this.lastTap = null;
      const cam = this.target.camera();
      this.target.flyTo(zoomAt(cam, this.target.viewport(), p.x, p.y, cam.zoom * DOUBLE_TAP_ZOOM));
      return;
    }
    this.lastTap = { ...p, t: now };
    this.target.onTap?.(p.x, p.y);
  }

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.velocity = null;
    const p = this.local(e);
    // Lines (Firefox) are much bigger steps than pixels; trackpad pinch arrives with ctrlKey.
    const delta = e.deltaY * (e.deltaMode === 1 ? 33 : 1) * (e.ctrlKey ? 4 : 1);
    const cam = this.target.camera();
    this.target.setCamera(
      zoomAt(cam, this.target.viewport(), p.x, p.y, cam.zoom * Math.exp(-delta * 0.0015)),
    );
  };

  private key = (e: KeyboardEvent) => {
    const view = this.target.viewport();
    const cam = this.target.camera();
    const step = Math.min(view.width, view.height) * 0.25;
    const moves: Record<string, () => Camera> = {
      "+": () => zoomAt(cam, view, view.width / 2, view.height / 2, cam.zoom * 1.6),
      "=": () => zoomAt(cam, view, view.width / 2, view.height / 2, cam.zoom * 1.6),
      "-": () => zoomAt(cam, view, view.width / 2, view.height / 2, cam.zoom / 1.6),
      ArrowLeft: () => panBy(cam, step, 0),
      ArrowRight: () => panBy(cam, -step, 0),
      ArrowUp: () => panBy(cam, 0, step),
      ArrowDown: () => panBy(cam, 0, -step),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    this.target.flyTo(move());
  };

  private pinchState() {
    const [a, b] = [...this.pointers.values()];
    return {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }
}
