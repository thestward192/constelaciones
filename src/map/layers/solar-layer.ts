import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import { formatNumber } from "../../lib/format";
import { worldToScreen } from "../camera";
import { hash01, type FrameState, type Fonts } from "../frame";
import type { SkyData } from "../sky-data";
import { COLORS, CSS, PLANET_STYLE, rgba, SUN_RADIUS } from "../style";
import { canvasTexture, type Atlas } from "../textures";

const SUN_MIN_PX = 7;
const PLANET_MIN_PX = 3.5;
/** Mercury takes 10 minutes per orbit; outer planets are slower (∝ √radius). */
const BASE_PERIOD_S = 600;

interface Planet {
  name: string;
  threshold: number;
  orbit: number;
  unlocked: boolean;
  phase: number;
  period: number;
  ring: Graphics;
  body: Sprite | null;
  label: Text;
}

/** The Sun at the center, the planets' orbits, the unlocked planets moving, and their labels. */
export class SolarLayer {
  readonly world = new Container();
  readonly labels = new Container();
  private sun = new Container();
  private corona: Sprite;
  private surfaces: Sprite[] = [];
  private planets: Planet[] = [];
  private textures = new Map<string, Texture>();

  constructor(
    private atlas: Atlas,
    private fonts: Fonts,
  ) {
    this.corona = new Sprite({
      texture: atlas.frames.soft,
      anchor: 0.5,
      tint: COLORS.gold,
      blendMode: "add",
    });
    const body = new Sprite({ texture: sunTexture(), anchor: 0.5 });
    body.width = body.height = SUN_RADIUS * 2;
    this.surfaces = [0, 1].map((i) => {
      const s = new Sprite({
        texture: granulationTexture(i),
        anchor: 0.5,
        blendMode: "add",
        alpha: 0.55,
      });
      s.width = s.height = SUN_RADIUS * 2;
      return s;
    });
    this.sun.addChild(this.corona, body, ...this.surfaces);
  }

  setData(data: SkyData) {
    for (const p of this.planets) {
      p.ring.destroy();
      p.body?.destroy();
      p.label.destroy();
    }
    this.world.removeChildren();
    this.planets = data.index.planets.map(([, name, threshold, orbit, unlockedDay]) => {
      const unlocked = unlockedDay !== null;
      const ring = new Graphics();
      if (unlocked) {
        ring
          .circle(0, 0, orbit)
          .stroke({ width: 1, pixelLine: true, color: COLORS.line, alpha: 0.16 });
      } else {
        // Dotted orbit of a planet still to unlock.
        const dashes = 180;
        for (let i = 0; i < dashes; i++) {
          const a0 = (i / dashes) * Math.PI * 2;
          const a1 = a0 + (Math.PI * 2) / dashes / 2.4;
          ring
            .moveTo(Math.cos(a0) * orbit, Math.sin(a0) * orbit)
            .lineTo(Math.cos(a1) * orbit, Math.sin(a1) * orbit);
        }
        ring.stroke({ width: 1, pixelLine: true, color: COLORS.line, alpha: 0.13 });
      }
      this.world.addChild(ring);

      const style = PLANET_STYLE[name] ?? { color: [200, 200, 200], radius: 40 };
      let body: Sprite | null = null;
      if (unlocked) {
        body = new Sprite({ texture: this.planetTexture(name), anchor: 0.5 });
        this.world.addChild(body);
      }
      const label = new Text({
        text: unlocked ? name : `${name} · ${formatNumber(threshold)} estrellas`,
        resolution: 2,
        style: {
          fontFamily: this.fonts.mono,
          fontSize: 11,
          letterSpacing: 0.6,
          fill: unlocked ? CSS.ink2 : CSS.ink3,
        },
      });
      label.anchor.set(0.5, 1);
      this.labels.addChild(label);
      return {
        name,
        threshold,
        orbit,
        unlocked,
        phase: hash01(threshold, 7) * Math.PI * 2,
        period: BASE_PERIOD_S * Math.sqrt(orbit / 730) * (style.rings ? 1.1 : 1),
        ring,
        body,
        label,
      };
    });
    this.world.addChild(this.sun);
  }

  update(frame: FrameState) {
    const { zoom } = frame.cam;
    const t = frame.time;

    // Sun: never smaller than a few pixels; corona breathes, surface turns slowly.
    this.sun.scale.set(Math.max(1, SUN_MIN_PX / (SUN_RADIUS * zoom)));
    const breathe = frame.reducedMotion ? 0 : Math.sin(t * 0.9);
    this.corona.width = this.corona.height = SUN_RADIUS * (5.2 + 0.25 * breathe);
    this.corona.alpha = 0.5 + 0.06 * breathe;
    if (!frame.reducedMotion) {
      this.surfaces[0].rotation = t * 0.035;
      this.surfaces[1].rotation = -t * 0.05;
      this.surfaces[1].alpha = 0.4 + 0.15 * Math.sin(t * 0.6);
    }

    const now = Date.now() / 1000;
    const labelWeight = frame.weights.planetLabels;
    this.labels.visible = labelWeight > 0.01;
    this.labels.alpha = labelWeight;
    for (const p of this.planets) {
      const angle = p.phase + (frame.reducedMotion ? 0 : (now / p.period) * Math.PI * 2);
      const x = Math.cos(angle) * p.orbit;
      const y = Math.sin(angle) * p.orbit;
      if (p.body) {
        const r = PLANET_STYLE[p.name]?.radius ?? 40;
        const scale = Math.max(1, PLANET_MIN_PX / (r * zoom));
        p.body.position.set(x, y);
        p.body.width = p.body.height = r * 2 * scale * (PLANET_STYLE[p.name]?.rings ? 2.2 : 1);
      }
      if (!this.labels.visible) continue;
      // Labels only when the orbit is big enough on screen to tell planets apart.
      const show = p.orbit * zoom > 45;
      p.label.visible = show;
      if (!show) continue;
      const anchor = p.unlocked ? { x, y } : { x: 0, y: -p.orbit };
      const s = worldToScreen(frame.cam, frame.view, anchor.x, anchor.y);
      const offset = p.unlocked
        ? Math.max(PLANET_MIN_PX, (PLANET_STYLE[p.name]?.radius ?? 40) * zoom) + 6
        : 4;
      p.label.position.set(Math.round(s.x), Math.round(s.y - offset));
    }
  }

  private planetTexture(name: string) {
    let texture = this.textures.get(name);
    if (!texture) {
      const style = PLANET_STYLE[name] ?? {
        color: [200, 200, 200] as [number, number, number],
        radius: 40,
      };
      texture = planetTexture(style.color, Boolean(style.rings));
      this.textures.set(name, texture);
    }
    return texture;
  }
}

function sunTexture() {
  return canvasTexture(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(118, 116, 0, 128, 128, 128);
    g.addColorStop(0, "#fffaf0");
    g.addColorStop(0.35, "#ffe9b8");
    g.addColorStop(0.75, "#f0c27a");
    g.addColorStop(0.95, "#d9954a");
    g.addColorStop(1, "rgba(217,149,74,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(128, 128, 128, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Mottled light for the Sun's surface; two layers turning in opposite directions. */
function granulationTexture(seed: number) {
  return canvasTexture(256, 256, (ctx) => {
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < 260; i++) {
      const a = hash01(i, seed) * Math.PI * 2;
      const d = Math.sqrt(hash01(seed, i)) * 118;
      const r = 4 + hash01(i + 99, seed) * 16;
      const x = 128 + Math.cos(a) * d;
      const y = 128 + Math.sin(a) * d;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,236,190,0.35)");
      g.addColorStop(1, "rgba(255,236,190,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}

function planetTexture(color: [number, number, number], rings: boolean) {
  // Rings need room: the body takes the middle 1 / 2.2 of the texture.
  const size = 256;
  const r = rings ? size / 2 / 2.2 : size / 2 - 2;
  return canvasTexture(size, size, (ctx) => {
    const c = size / 2;
    if (rings) {
      ctx.strokeStyle = rgba(color, 0.55);
      ctx.lineWidth = r * 0.22;
      ctx.beginPath();
      ctx.ellipse(c, c, r * 2, r * 0.62, -0.35, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(c - r * 0.35, c - r * 0.35, r * 0.1, c, c, r);
    g.addColorStop(0, rgba(color.map((v) => Math.min(255, v + 50)) as [number, number, number], 1));
    g.addColorStop(0.7, rgba(color, 1));
    g.addColorStop(1, rgba(color.map((v) => v * 0.35) as [number, number, number], 1));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();
    if (rings) {
      ctx.strokeStyle = rgba(color, 0.7);
      ctx.lineWidth = r * 0.22;
      ctx.beginPath();
      ctx.ellipse(c, c, r * 2, r * 0.62, -0.35, 0, Math.PI);
      ctx.stroke();
    }
  });
}
