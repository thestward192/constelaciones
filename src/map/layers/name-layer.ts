import { BitmapFont, BitmapText, Container } from "pixi.js";
import { worldToScreen } from "../camera";
import type { FrameState, Fonts } from "../frame";
import type { LoadedConstellation } from "../sky-data";
import { starScreenRadius } from "../style";

export const MONO_BITMAP_FONT = "constelaciones-mono";
const FONT = MONO_BITMAP_FONT;
const MAX_NAMES = 700;

/**
 * @usernames next to each star at the "Nombre" zoom level. Bitmap text from a pool, so
 * hundreds of names cost almost nothing to move every frame.
 */
export class NameLayer {
  readonly container = new Container();
  private pool: BitmapText[] = [];

  constructor(fonts: Fonts) {
    installMonoBitmapFont(fonts);
  }

  update(frame: FrameState, visible: LoadedConstellation[]) {
    const weight = frame.weights.names;
    this.container.visible = weight > 0.01;
    if (!this.container.visible) return;
    this.container.alpha = weight * 0.65;

    const { view, cam } = frame;
    // Candidates on screen, brightest first: when names would overlap, the brighter star keeps its own.
    const candidates: { username: string; x: number; y: number; level: number }[] = [];
    for (const loaded of visible) {
      for (const [, username, x, y, level] of loaded.file.stars) {
        const p = worldToScreen(cam, view, x, y);
        if (p.x < -20 || p.y < -20 || p.x > view.width + 20 || p.y > view.height + 20) continue;
        candidates.push({ username, x: p.x, y: p.y, level });
      }
    }
    candidates.sort((a, b) => b.level - a.level);

    const placed = new LabelGrid();
    let used = 0;
    for (const c of candidates) {
      if (used >= MAX_NAMES) break;
      const text = `@${c.username}`;
      const left = Math.round(c.x + starScreenRadius(c.level, cam.zoom) + 5);
      const top = Math.round(c.y - 6);
      const width = text.length * CHAR_WIDTH;
      if (!placed.tryPlace(left, top, width, LINE_HEIGHT)) continue;
      const label = this.take(used++);
      if (label.text !== text) label.text = text;
      label.position.set(left, top);
      label.visible = true;
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  private take(i: number) {
    if (!this.pool[i]) {
      const text = new BitmapText({
        text: "",
        style: { fontFamily: FONT, fontSize: 10.5, fill: 0xc8d2e8 },
      });
      this.pool[i] = text;
      this.container.addChild(text);
    }
    return this.pool[i];
  }
}

/** Approximate advance of IBM Plex Mono at 10.5 px, and one line of names. */
const CHAR_WIDTH = 6.4;
const LINE_HEIGHT = 13;

/** Screen rectangles already taken by names, bucketed for quick overlap checks. */
class LabelGrid {
  private cells = new Map<string, [number, number, number, number][]>();
  private readonly size = 64;

  tryPlace(x: number, y: number, w: number, h: number): boolean {
    const keys: string[] = [];
    for (let gx = Math.floor(x / this.size); gx <= Math.floor((x + w) / this.size); gx++) {
      for (let gy = Math.floor(y / this.size); gy <= Math.floor((y + h) / this.size); gy++) {
        const key = `${gx},${gy}`;
        for (const [ox, oy, ow, oh] of this.cells.get(key) ?? []) {
          if (x < ox + ow && x + w > ox && y < oy + oh && y + h > oy) return false;
        }
        keys.push(key);
      }
    }
    for (const key of keys) {
      const cell = this.cells.get(key);
      if (cell) cell.push([x, y, w, h]);
      else this.cells.set(key, [[x, y, w, h]]);
    }
    return true;
  }
}

let installed = false;
/** Bitmap version of IBM Plex Mono for names and numbers (white; tinted per use). */
export function installMonoBitmapFont(fonts: Fonts) {
  if (installed) return;
  BitmapFont.install({
    name: FONT,
    style: { fontFamily: fonts.mono, fontSize: 22, fontWeight: "500", fill: "#ffffff" },
    chars: [["a", "z"], ["0", "9"], "._@ ·"],
    resolution: 2,
  });
  installed = true;
}
