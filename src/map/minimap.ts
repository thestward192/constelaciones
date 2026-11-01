import { visibleRect, type Camera, type Viewport } from "./camera";
import type { SkyData } from "./sky-data";

/**
 * Corner minimap: the Sun, orbits, every constellation as a point, and a gold box where the
 * person is looking. Tapping it travels there. Plain 2D canvas, redrawn only when needed.
 */
export class Minimap {
  private base: HTMLCanvasElement | null = null;
  private extent = 1;
  private size = 0;
  private dpr = 1;

  constructor(
    private canvas: HTMLCanvasElement,
    private onPick: (x: number, y: number) => void,
  ) {
    canvas.addEventListener("pointerdown", this.pick);
  }

  destroy() {
    this.canvas.removeEventListener("pointerdown", this.pick);
  }

  setData(data: SkyData) {
    this.extent = data.radius * 1.08;
    this.base = null;
  }

  draw(data: SkyData | null, cam: Camera, view: Viewport) {
    const size = this.canvas.clientWidth;
    if (!size || !data) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (size !== this.size || dpr !== this.dpr || !this.base) {
      this.size = size;
      this.dpr = dpr;
      this.canvas.width = this.canvas.height = Math.round(size * dpr);
      this.base = this.drawBase(data);
    }
    const ctx = this.canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);

    const k = (size * dpr) / 2 / this.extent;
    const c = (size * dpr) / 2;
    const r = visibleRect(cam, view);
    const x0 = c + r.x0 * k;
    const y0 = c + r.y0 * k;
    const w = (r.x1 - r.x0) * k;
    const h = (r.y1 - r.y0) * k;
    ctx.strokeStyle = "rgba(232,203,143,0.95)";
    ctx.lineWidth = dpr;
    if (w < 4 * dpr && h < 4 * dpr) {
      // Too small to see as a box: a marker instead.
      ctx.beginPath();
      ctx.arc(x0 + w / 2, y0 + h / 2, 3 * dpr, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(x0, y0, w, h);
    }
  }

  private drawBase(data: SkyData) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = this.canvas.width;
    const ctx = canvas.getContext("2d")!;
    const k = canvas.width / 2 / this.extent;
    const c = canvas.width / 2;
    const today = data.index.day;

    ctx.lineWidth = this.dpr * 0.8;
    for (const [, , , orbit, unlockedDay] of data.index.planets) {
      if (orbit > this.extent) continue;
      ctx.strokeStyle = unlockedDay !== null ? "rgba(200,212,240,0.28)" : "rgba(200,212,240,0.14)";
      ctx.setLineDash(unlockedDay !== null ? [] : [2 * this.dpr, 3 * this.dpr]);
      ctx.beginPath();
      ctx.arc(c, c, orbit * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const dot = Math.max(1, this.dpr * (data.constellations.length > 2000 ? 0.8 : 1.4));
    // Many constellations: fainter points, so the spiral keeps its texture instead of a solid disc.
    const faint = Math.min(0.55, 0.55 * Math.sqrt(600 / Math.max(1, data.constellations.length)));
    for (const con of data.constellations) {
      const highlight = !con.complete || (today !== null && con.completedDay === today);
      ctx.fillStyle = highlight
        ? "rgba(232,203,143,0.95)"
        : `rgba(220,228,248,${faint.toFixed(3)})`;
      ctx.fillRect(c + con.x * k - dot / 2, c + con.y * k - dot / 2, dot, dot);
    }

    const sun = ctx.createRadialGradient(c, c, 0, c, c, 5 * this.dpr);
    sun.addColorStop(0, "rgba(255,240,205,1)");
    sun.addColorStop(1, "rgba(232,203,143,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(c - 6 * this.dpr, c - 6 * this.dpr, 12 * this.dpr, 12 * this.dpr);
    return canvas;
  }

  private pick = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const k = rect.width / 2 / this.extent;
    this.onPick(
      (e.clientX - rect.left - rect.width / 2) / k,
      (e.clientY - rect.top - rect.height / 2) / k,
    );
  };
}
