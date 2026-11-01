import { Particle, ParticleContainer } from "pixi.js";
import { fadeIn } from "../zoom-levels";
import { hash01, type FrameState } from "../frame";
import type { LoadedConstellation } from "../sky-data";
import { LEVEL_STYLE, STAR_ZOOM_EXPONENT } from "../style";
import { CELL, REF_RADIUS, type Atlas } from "../textures";

const enum Kind {
  Glow,
  Flare,
  Rings,
  Trail,
  Border,
}

interface Entry {
  p: Particle;
  kind: Kind;
  /** Scale at zoom 1; the real scale is base · zoom^(exponent − 1). */
  base: number;
  alpha: number;
  speed: number;
  phase: number;
  constellation: number;
}

/**
 * Every star of the visible constellations, plus their rings, trails, flares and gold borders,
 * as particles of one container in world coordinates. Only the constellations on screen are in
 * the container; cached ones keep their particles ready.
 */
export class StarLayer {
  readonly container: ParticleContainer;
  private byConstellation = new Map<number, Entry[]>();
  private visible: number[] = [];
  private entries: Entry[] = [];
  private dirty = false;
  private lastFactor = 0;
  private focus: number | null = null;

  constructor(private atlas: Atlas) {
    this.container = new ParticleContainer({
      texture: atlas.base,
      dynamicProperties: {
        position: false,
        vertex: false,
        rotation: false,
        uvs: false,
        color: true,
      },
    });
  }

  add(loaded: LoadedConstellation) {
    const { file } = loaded;
    const anchorKeys = new Set((file.figure?.anchors ?? []).map(([x, y]) => `${x},${y}`));
    const entries: Entry[] = [];
    for (const star of file.stars) {
      const [slot, , x, y, level, rings, shooting, gold] = star;
      const anchor = anchorKeys.has(`${x},${y}`);
      const r = LEVEL_STYLE[level].r * (anchor ? 1.25 : 1);
      const speed = 0.6 + hash01(file.id, slot) * 1.1;
      const phase = hash01(slot, file.id) * Math.PI * 2;
      const make = (kind: Kind, frame: keyof Atlas["frames"], base: number, alpha: number) => {
        const p = new Particle({
          texture: this.atlas.frames[frame],
          x,
          y,
          anchorX: 0.5,
          anchorY: 0.5,
        });
        entries.push({ p, kind, base, alpha, speed, phase, constellation: file.id });
      };
      // Glow sprite is 7 radii wide (prototype), a bit wider from Gigante azul up.
      make(Kind.Glow, `glow${level as 0}`, (r * 7 * (level >= 3 ? 1.25 : 1)) / CELL, 1);
      const detail = r / REF_RADIUS;
      if (level >= 5) make(Kind.Flare, "flare", detail, 0.55);
      if (rings > 0) make(Kind.Rings, `ring${Math.min(3, rings) as 1}`, detail, 0.9);
      if (shooting > 0) make(Kind.Trail, "trail", detail, 0.8);
      if (gold) make(Kind.Border, "border", detail, 0.9);
    }
    this.byConstellation.set(file.id, entries);
    if (this.visible.includes(file.id)) this.dirty = true;
  }

  remove(id: number) {
    if (this.byConstellation.delete(id) && this.visible.includes(id)) this.dirty = true;
  }

  has(id: number) {
    return this.byConstellation.has(id);
  }

  /** Constellations on screen now. */
  /** With a star selected, the other constellations dim (prototype: 55%). */
  setFocus(constellationId: number | null) {
    this.focus = constellationId;
  }

  setVisible(ids: number[]) {
    if (ids.length === this.visible.length && ids.every((id, i) => id === this.visible[i])) return;
    this.visible = ids;
    this.dirty = true;
  }

  update(frame: FrameState) {
    const { zoom } = frame.cam;
    const weight = frame.weights.stars;
    if (this.dirty) {
      this.entries = this.visible.flatMap((id) => this.byConstellation.get(id) ?? []);
      this.container.particleChildren = this.entries.map((e) => e.p);
      this.dirty = false;
      this.lastFactor = 0;
    }
    // An empty particle container must not be drawn (WebGL rejects the empty buffer).
    this.container.visible = weight > 0.01 && this.entries.length > 0;
    if (!this.container.visible) return;

    // Scales change with zoom; re-upload them only when the change is visible.
    const factor = zoom ** (STAR_ZOOM_EXPONENT - 1);
    if (Math.abs(factor / this.lastFactor - 1) > 0.015) {
      for (const e of this.entries) {
        e.p.scaleX = e.p.scaleY = e.base * factor;
      }
      this.lastFactor = factor;
      this.container.update();
    }

    const details = frame.weights.starDetails;
    const trails = fadeIn(zoom, 1.1);
    const t = frame.time;
    const still = frame.reducedMotion;
    for (const e of this.entries) {
      const twinkle = still ? 1 : 0.78 + 0.22 * Math.sin(t * e.speed + e.phase);
      let a = e.alpha * weight * (this.focus !== null && e.constellation !== this.focus ? 0.55 : 1);
      if (e.kind === Kind.Glow || e.kind === Kind.Flare) a *= twinkle;
      else if (e.kind === Kind.Trail) a *= trails;
      else a *= details;
      e.p.alpha = a;
    }
  }
}
