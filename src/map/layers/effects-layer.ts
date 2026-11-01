import { Container, Graphics, Sprite, Text } from "pixi.js";
import { spiralPosition } from "../../sky/geometry";
import { worldToScreen } from "../camera";
import { hash01, type FrameState, type Fonts } from "../frame";
import type { SkyData } from "../sky-data";
import { canvasTexture, type Atlas } from "../textures";

interface Streak {
  name: string | null;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  start: number;
  duration: number;
  width: number;
  tail: number;
  head: Sprite;
  label: Text | null;
}

interface Area {
  x: number;
  y: number;
  r: number;
  constellations: { x: number; y: number; r: number }[];
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Moving things: today's shooting stars crossing the screen with their names, and the
 * permanent unlocks of daily challenges (aurora, comet, moon, star shower, nebula).
 */
export class EffectsLayer {
  readonly world = new Container();
  readonly screen = new Container();
  private trails = new Graphics();
  private streaks: Streak[] = [];
  private shooting: string[] = [];
  private nextShooting = 1.4;
  private shootingIndex = 0;
  private auroras: { sprite: Sprite; phase: number }[] = [];
  private comets: {
    head: Sprite;
    tail: Sprite;
    a: number;
    b: number;
    tilt: number;
    period: number;
    phase: number;
  }[] = [];
  private moons: { sprite: Sprite; r: number }[] = [];
  private showers: { area: Area; next: number }[] = [];
  private nebulae: Sprite[] = [];

  constructor(
    private atlas: Atlas,
    private fonts: Fonts,
  ) {
    this.screen.addChild(this.trails);
  }

  setData(data: SkyData) {
    this.world.removeChildren().forEach((c) => c.destroy());
    this.auroras = [];
    this.comets = [];
    this.moons = [];
    this.showers = [];
    this.nebulae = [];
    this.shooting = data.index.shooting;

    for (const unlock of data.index.unlocks) {
      const area = areaOfDay(data, unlock.day);
      const seed = unlock.day;
      switch (unlock.type) {
        case "aurora":
          for (const c of area.constellations.slice(0, 6)) {
            for (let k = 0; k < 2; k++) {
              const sprite = new Sprite({
                texture: this.atlas.frames.soft,
                anchor: 0.5,
                blendMode: "add",
                tint: k === 0 ? 0x6fe3c1 : 0x7fb8ff,
              });
              sprite.width = c.r * (2.2 - k * 0.6);
              sprite.height = c.r * 1.1;
              sprite.position.set(c.x + (k - 0.5) * c.r * 0.5, c.y - c.r * 1.05);
              this.world.addChild(sprite);
              this.auroras.push({ sprite, phase: hash01(seed, k) * 6 });
            }
          }
          break;
        case "cometa": {
          const tail = new Sprite({
            texture: this.atlas.frames.soft,
            anchor: { x: 0.08, y: 0.5 },
            blendMode: "add",
            tint: 0xcfe0ff,
          });
          const head = new Sprite({
            texture: this.atlas.frames.glow6,
            anchor: 0.5,
            blendMode: "add",
          });
          this.world.addChild(tail, head);
          const a = Math.max(data.radius * 0.8, 1500);
          this.comets.push({
            head,
            tail,
            a,
            b: a * 0.42,
            tilt: hash01(seed, 1) * Math.PI,
            period: 160,
            phase: hash01(seed, 2),
          });
          break;
        }
        case "luna": {
          const r = 90; // a bit bigger than a planet, far smaller than a constellation
          const sprite = new Sprite({ texture: moonTexture(), anchor: 0.5 });
          sprite.position.set(area.x + area.r * 1.15, area.y - area.r * 0.85);
          this.world.addChild(sprite);
          this.moons.push({ sprite, r });
          break;
        }
        case "lluvia":
          this.showers.push({ area, next: 0 });
          break;
        case "nebulosa": {
          // A color of its own, picked from the day.
          const hue = Math.round(hash01(seed, 3) * 360);
          for (let k = 0; k < 3; k++) {
            const sprite = new Sprite({
              texture: this.atlas.frames.soft,
              anchor: 0.5,
              blendMode: "add",
              tint: hslToHex(hue + k * 24, 0.65, 0.6),
              alpha: 0.28,
            });
            const s = area.r * (3.4 - k * 0.6);
            sprite.width = s;
            sprite.height = s * (0.6 + hash01(seed, k) * 0.4);
            sprite.rotation = hash01(seed, k + 5) * Math.PI;
            sprite.position.set(
              area.x + (k - 1) * area.r * 0.25,
              area.y + (hash01(seed, k + 9) - 0.5) * area.r * 0.4,
            );
            this.world.addChildAt(sprite, 0);
            this.nebulae.push(sprite);
          }
          break;
        }
      }
    }
  }

  update(frame: FrameState) {
    const t = frame.time;
    const zoom = frame.cam.zoom;

    for (const a of this.auroras) {
      a.sprite.alpha = 0.16 + (frame.reducedMotion ? 0 : 0.08 * Math.sin(t * 0.5 + a.phase));
    }
    for (const c of this.comets) {
      const angle = frame.reducedMotion
        ? c.phase * Math.PI * 2
        : ((t / c.period + c.phase) % 1) * Math.PI * 2;
      const ex = Math.cos(angle) * c.a;
      const ey = Math.sin(angle) * c.b;
      const x = ex * Math.cos(c.tilt) - ey * Math.sin(c.tilt);
      const y = ex * Math.sin(c.tilt) + ey * Math.cos(c.tilt);
      const size = Math.max(40, 6 / zoom);
      c.head.position.set(x, y);
      c.head.width = c.head.height = size * 2;
      // The tail points away from the Sun.
      c.tail.position.set(x, y);
      c.tail.rotation = Math.atan2(y, x);
      c.tail.width = size * 9;
      c.tail.height = size * 1.4;
      c.tail.alpha = 0.55;
    }
    for (const m of this.moons) {
      const scale = Math.max(1, 6 / (m.r * zoom));
      m.sprite.width = m.sprite.height = m.r * 2 * scale;
    }
    for (const n of this.nebulae) n.visible = zoom < 3;

    this.updateShooting(frame);
    this.updateShowers(frame);
  }

  private updateShooting(frame: FrameState) {
    const { width, height } = frame.view;
    const t = frame.time;
    if (!frame.reducedMotion && this.shooting.length && t > this.nextShooting) {
      const name = this.shooting[this.shootingIndex++ % this.shooting.length];
      const x0 = width * (0.15 + Math.random() * 0.55);
      const y0 = height * (0.12 + Math.random() * 0.25);
      const angle = ((18 + Math.random() * 18) * Math.PI) / 180;
      const distance = Math.min(width, 900) * (0.35 + Math.random() * 0.2);
      this.spawn(
        {
          name,
          x0,
          y0,
          x1: x0 + Math.cos(angle) * distance,
          y1: y0 + Math.sin(angle) * distance,
          duration: 2.2,
          width: 1.6,
          tail: 180,
        },
        t,
      );
      this.nextShooting = t + 4.2 + Math.random() * 2.5;
    }
    this.drawStreaks(t);
  }

  private updateShowers(frame: FrameState) {
    if (frame.reducedMotion) return;
    for (const shower of this.showers) {
      if (frame.time < shower.next) continue;
      shower.next = frame.time + 0.9 + Math.random() * 1.4;
      const c = worldToScreen(frame.cam, frame.view, shower.area.x, shower.area.y);
      const r = Math.max(60, shower.area.r * frame.cam.zoom);
      if (c.x + r < 0 || c.y + r < 0 || c.x - r > frame.view.width || c.y - r > frame.view.height)
        continue;
      for (let k = 0; k < 3; k++) {
        const x0 = c.x + (Math.random() - 0.6) * r * 1.6;
        const y0 = c.y + (Math.random() - 0.7) * r * 1.2;
        const length = 40 + Math.random() * 60;
        this.spawn(
          {
            name: null,
            x0,
            y0,
            x1: x0 + length * 0.85,
            y1: y0 + length * 0.5,
            duration: 0.7 + Math.random() * 0.3,
            width: 1,
            tail: 50,
          },
          frame.time + k * 0.15,
        );
      }
    }
  }

  private spawn(s: Omit<Streak, "start" | "head" | "label">, start: number) {
    const head = new Sprite({ texture: this.atlas.frames.glow5, anchor: 0.5, blendMode: "add" });
    head.width = head.height = s.name ? 24 : 12;
    this.screen.addChild(head);
    let label: Text | null = null;
    if (s.name) {
      label = new Text({
        text: `@${s.name}`,
        resolution: 2,
        style: { fontFamily: this.fonts.mono, fontSize: 11, fontWeight: "500", fill: "#f0e2c4" },
      });
      this.screen.addChild(label);
    }
    this.streaks.push({ ...s, start, head, label });
  }

  private drawStreaks(t: number) {
    const g = this.trails;
    g.clear();
    this.streaks = this.streaks.filter((s) => {
      const p = (t - s.start) / s.duration;
      if (p >= 1) {
        s.head.destroy();
        s.label?.destroy();
        return false;
      }
      const visible = p >= 0;
      s.head.visible = visible;
      if (s.label) s.label.visible = visible;
      if (!visible) return true;
      const e = ease(Math.min(1, p * 1.15));
      const hx = s.x0 + (s.x1 - s.x0) * e;
      const hy = s.y0 + (s.y1 - s.y0) * e;
      const angle = Math.atan2(s.y1 - s.y0, s.x1 - s.x0);
      const tail = Math.min(s.tail, e * s.tail * 2.2);
      const fade = p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
      // Tail as segments fading toward the end (gradient look without a gradient fill).
      const segments = 10;
      for (let i = 0; i < segments; i++) {
        const a = tail * (i / segments);
        const b = tail * ((i + 1) / segments);
        g.moveTo(hx - Math.cos(angle) * a, hy - Math.sin(angle) * a)
          .lineTo(hx - Math.cos(angle) * b, hy - Math.sin(angle) * b)
          .stroke({ width: s.width, color: 0xfff4de, alpha: 0.9 * fade * (1 - i / segments) });
      }
      s.head.position.set(hx, hy);
      s.head.alpha = fade;
      if (s.label) {
        s.label.position.set(Math.round(hx + 12), Math.round(hy + 6));
        s.label.alpha = fade;
      }
      return true;
    });
  }
}

/**
 * Where a day's unlock lives: next to the last constellation completed that day. (The
 * constellations of one day are spread all around the spiral, 137.5° apart, so their common
 * center would be meaningless.) Auroras still crown every constellation of that day.
 */
function areaOfDay(data: SkyData, day: number): Area {
  let list = data.constellations.filter((c) => c.completedDay === day);
  if (!list.length) {
    list = data.constellations
      .filter((c) => c.completedDay !== null && c.completedDay <= day)
      .slice(-1);
  }
  const anchor = list[list.length - 1];
  if (!anchor) {
    const p = spiralPosition(Math.max(1, day));
    return { x: p.x, y: p.y, r: 300, constellations: [] };
  }
  return { x: anchor.x, y: anchor.y, r: anchor.r, constellations: list };
}

function moonTexture() {
  return canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(56, 54, 4, 64, 64, 62);
    g.addColorStop(0, "#f7f4ea");
    g.addColorStop(0.8, "#d9d6cc");
    g.addColorStop(1, "#9c9a92");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(64, 64, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(120,118,110,0.22)";
    for (const [x, y, r] of [
      [48, 50, 10],
      [78, 70, 14],
      [60, 88, 7],
      [86, 44, 6],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function hslToHex(h: number, s: number, l: number): number {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}
