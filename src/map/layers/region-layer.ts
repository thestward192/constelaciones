import { BitmapText, Container, Particle, ParticleContainer } from "pixi.js";
import { worldToScreen } from "../camera";
import type { FrameState, Fonts } from "../frame";
import type { SkyData } from "../sky-data";
import { COLORS } from "../style";
import { CELL, type Atlas } from "../textures";
import { installMonoBitmapFont, MONO_BITMAP_FONT } from "./name-layer";

const MAX_NUMBERS = 260;
const NUMBERS_FROM_ZOOM = 0.055;

/**
 * "Región" level: each constellation as one spot of light (from the index, no star files),
 * with its number when there is room for it.
 */
export class RegionLayer {
  readonly spots: ParticleContainer;
  readonly numbers = new Container();
  private particles: { p: Particle; r: number; alpha: number }[] = [];
  private pool: BitmapText[] = [];
  private lastZoom = 0;

  constructor(
    private atlas: Atlas,
    fonts: Fonts,
  ) {
    installMonoBitmapFont(fonts);
    this.spots = new ParticleContainer({
      texture: atlas.base,
      dynamicProperties: {
        position: false,
        vertex: false,
        rotation: false,
        uvs: false,
        color: false,
      },
    });
  }

  setData(data: SkyData) {
    const today = data.index.day;
    this.particles = data.constellations.map((c) => {
      const highlight = !c.complete || (today !== null && c.completedDay === today);
      const alpha = c.complete ? 0.6 : 0.35 + 0.45 * (c.count / 300);
      const p = new Particle({
        texture: this.atlas.frames.soft,
        x: c.x,
        y: c.y,
        anchorX: 0.5,
        anchorY: 0.5,
        tint: highlight ? COLORS.gold : 0xdce6ff,
        alpha,
      });
      return { p, r: c.r, alpha };
    });
    this.spots.particleChildren = this.particles.map((s) => s.p);
    this.lastZoom = 0;
  }

  update(frame: FrameState, data: SkyData | null) {
    const weight = frame.weights.regionDots;
    this.spots.visible = weight > 0.01 && this.particles.length > 0;
    this.numbers.visible = this.spots.visible && frame.cam.zoom >= NUMBERS_FROM_ZOOM;
    if (!this.spots.visible || !data) return;
    this.spots.alpha = weight;

    const { zoom } = frame.cam;
    if (Math.abs(zoom / this.lastZoom - 1) > 0.02) {
      for (const s of this.particles) {
        // At least 10 px wide, so far-away constellations still read as spots.
        const screen = Math.max(s.r * 2.4 * zoom, 10);
        s.p.scaleX = s.p.scaleY = screen / zoom / CELL;
      }
      this.lastZoom = zoom;
      this.spots.update();
    }

    if (!this.numbers.visible) return;
    this.numbers.alpha = weight * Math.min(1, (zoom - NUMBERS_FROM_ZOOM) / NUMBERS_FROM_ZOOM);
    const onScreen = data.grid.query(frame.rect);
    let used = 0;
    if (onScreen.length <= MAX_NUMBERS) {
      for (const c of onScreen) {
        const p = worldToScreen(frame.cam, frame.view, c.x, c.y);
        const label = this.take(used++);
        const text = String(c.id);
        if (label.text !== text) label.text = text;
        label.position.set(
          Math.round(p.x - label.width / 2),
          Math.round(p.y + Math.max(c.r * zoom * 0.9, 9)),
        );
        label.visible = true;
      }
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  private take(i: number) {
    if (!this.pool[i]) {
      const text = new BitmapText({
        text: "",
        style: { fontFamily: MONO_BITMAP_FONT, fontSize: 10, fill: 0xa3adc4 },
      });
      this.pool[i] = text;
      this.numbers.addChild(text);
    }
    return this.pool[i];
  }
}
