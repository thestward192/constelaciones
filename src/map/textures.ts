import { Rectangle, Texture } from "pixi.js";
import { LEVEL_STYLE, rgba } from "./style";

// Every sprite the star layers use lives in one atlas: a ParticleContainer needs all its
// particles to share one texture source, and one source means one draw call.

export const CELL = 128;
/** Sizes drawn in the ring, trail, flare and border cells assume a star of this radius (px). */
export const REF_RADIUS = 12;

export type AtlasFrame =
  | `glow${0 | 1 | 2 | 3 | 4 | 5 | 6}`
  | "flare"
  | "ring1"
  | "ring2"
  | "ring3"
  | "trail"
  | "border"
  | "dot"
  | "soft";

export interface Atlas {
  frames: Record<AtlasFrame, Texture>;
  /** Shared source, needed by ParticleContainer. */
  base: Texture;
}

const GOLD: [number, number, number] = [232, 203, 143];

export function buildAtlas(): Atlas {
  const order: AtlasFrame[] = [
    "glow0",
    "glow1",
    "glow2",
    "glow3",
    "glow4",
    "glow5",
    "glow6",
    "flare",
    "ring1",
    "ring2",
    "ring3",
    "trail",
    "border",
    "dot",
    "soft",
  ];
  const columns = 4;
  const canvas = document.createElement("canvas");
  canvas.width = columns * CELL;
  canvas.height = Math.ceil(order.length / columns) * CELL;
  const ctx = canvas.getContext("2d")!;

  order.forEach((name, i) => {
    ctx.save();
    ctx.translate((i % columns) * CELL + CELL / 2, Math.floor(i / columns) * CELL + CELL / 2);
    draw(ctx, name);
    ctx.restore();
  });

  const base = Texture.from(canvas);
  const frames = Object.fromEntries(
    order.map((name, i) => [
      name,
      new Texture({
        source: base.source,
        frame: new Rectangle((i % columns) * CELL, Math.floor(i / columns) * CELL, CELL, CELL),
      }),
    ]),
  ) as Record<AtlasFrame, Texture>;
  return { frames, base };
}

function draw(ctx: CanvasRenderingContext2D, name: AtlasFrame) {
  const h = CELL / 2;
  const r = REF_RADIUS;
  if (name.startsWith("glow")) {
    // Prototype glow: bright core, quick falloff, wide faint halo.
    const c = LEVEL_STYLE[Number(name.slice(4))].color;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, h);
    g.addColorStop(0, rgba(c, 1));
    g.addColorStop(0.08, rgba(c, 0.95));
    g.addColorStop(0.22, rgba(c, 0.32));
    g.addColorStop(0.5, rgba(c, 0.07));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-h, -h, CELL, CELL);
    return;
  }
  ctx.lineCap = "round";
  switch (name) {
    case "flare": {
      // Cross flare of Nova and Supernova: arms of 4 star radii.
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        const g = ctx.createLinearGradient(-dx * r * 4, -dy * r * 4, dx * r * 4, dy * r * 4);
        g.addColorStop(0, "rgba(255,248,230,0)");
        g.addColorStop(0.5, "rgba(255,248,230,0.85)");
        g.addColorStop(1, "rgba(255,248,230,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-dx * r * 4, -dy * r * 4);
        ctx.lineTo(dx * r * 4, dy * r * 4);
        ctx.stroke();
      }
      return;
    }
    case "ring1":
    case "ring2":
    case "ring3": {
      // Golden rings, tilted like Saturn's (prototype ellipses).
      const count = Number(name.slice(4));
      ctx.strokeStyle = rgba(GOLD, 0.6);
      ctx.lineWidth = 1.4;
      for (let k = 0; k < count; k++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, r * (2.6 + k * 1.1), r * (1 + k * 0.42), -0.35, 0, Math.PI * 2);
        ctx.stroke();
      }
      return;
    }
    case "trail": {
      // Short golden trail of a star that was once a shooting star, from the upper left.
      const g = ctx.createLinearGradient(-r * 4.4, -r * 2.5, 0, 0);
      g.addColorStop(0, rgba(GOLD, 0));
      g.addColorStop(1, rgba(GOLD, 0.6));
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-r * 4.4, -r * 2.5);
      ctx.lineTo(-r * 1.1, -r * 0.62);
      ctx.stroke();
      return;
    }
    case "border": {
      ctx.strokeStyle = rgba(GOLD, 0.9);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.9, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    case "dot": {
      // Solid small disc (minimap-like markers, region numbers backdrop).
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(0, 0, h * 0.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case "soft": {
      // Wide soft white glow, tinted per use (region spots, nebulae, auroras).
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, h);
      g.addColorStop(0, "rgba(255,255,255,0.9)");
      g.addColorStop(0.3, "rgba(255,255,255,0.35)");
      g.addColorStop(0.65, "rgba(255,255,255,0.08)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-h, -h, CELL, CELL);
      return;
    }
  }
}

/** A standalone canvas texture (sun, planets, background). */
export function canvasTexture(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext("2d")!);
  return Texture.from(canvas);
}
