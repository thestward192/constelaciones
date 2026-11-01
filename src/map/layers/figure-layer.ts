import { Container, Graphics, Text } from "pixi.js";
import { worldToScreen } from "../camera";
import type { FrameState, Fonts } from "../frame";
import type { LoadedConstellation } from "../sky-data";
import { COLORS, CSS, toRoman } from "../style";

const REVEAL_SECONDS = 2.8;
const TITLE_FONT_SIZE = 30;

interface Figure {
  loaded: LoadedConstellation;
  lines: Graphics | null;
  today: boolean;
  /** Time the reveal started (today's constellations draw their lines one by one). */
  revealFrom: number | null;
  revealed: boolean;
  label: Container | null;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Constellation lines (world space, 1 px) and their labels under each figure (screen space):
 * "CONSTELACIÓN XII · HOY" in mono and the name in Cormorant. A forming constellation shows no
 * lines and no name, only its counter.
 */
export class FigureLayer {
  readonly lines = new Container();
  readonly labels = new Container();
  private figures = new Map<number, Figure>();
  private visible = new Set<number>();

  constructor(private fonts: Fonts) {}

  add(loaded: LoadedConstellation, today: number | null) {
    this.remove(loaded.file.id);
    const { file } = loaded;
    const isToday = file.status === "complete" && today !== null && file.completedDay === today;
    let lines: Graphics | null = null;
    if (file.figure) {
      lines = new Graphics();
      this.lines.addChild(lines);
    }
    this.figures.set(file.id, {
      loaded,
      lines,
      today: isToday,
      revealFrom: null,
      revealed: !isToday,
      label: null,
    });
    if (lines) this.drawLines(this.figures.get(file.id)!, 1);
  }

  remove(id: number) {
    const figure = this.figures.get(id);
    if (!figure) return;
    figure.lines?.destroy();
    figure.label?.destroy({ children: true });
    this.figures.delete(id);
  }

  private focus: number | null = null;

  setFocus(constellationId: number | null) {
    this.focus = constellationId;
  }

  setVisible(ids: number[]) {
    this.visible = new Set(ids);
  }

  update(frame: FrameState) {
    const lineAlpha = frame.weights.stars;
    const labelAlpha = frame.weights.constellationLabels;
    this.lines.visible = lineAlpha > 0.01;
    this.labels.visible = labelAlpha > 0.01;

    for (const [id, figure] of this.figures) {
      const onScreen = this.visible.has(id);
      if (figure.lines) {
        figure.lines.visible = onScreen;
        figure.lines.alpha = lineAlpha * this.dim(id);
        if (onScreen && !figure.revealed && lineAlpha > 0.5) {
          if (frame.reducedMotion) {
            figure.revealed = true;
            this.drawLines(figure, 1);
          } else {
            figure.revealFrom ??= frame.time;
            const progress = Math.min(1, (frame.time - figure.revealFrom) / REVEAL_SECONDS);
            this.drawLines(figure, progress);
            if (progress >= 1) figure.revealed = true;
          }
        }
      }

      if (!onScreen || !this.labels.visible) {
        if (figure.label) figure.label.visible = false;
        continue;
      }
      figure.label ??= this.createLabel(figure);
      const { info } = figure.loaded;
      const p = worldToScreen(frame.cam, frame.view, info.x, info.y + info.r);
      const offscreen =
        p.x < -300 || p.x > frame.view.width + 300 || p.y < -80 || p.y > frame.view.height + 120;
      figure.label.visible = !offscreen;
      if (offscreen) continue;
      // Today's name appears once its lines are mostly drawn.
      const revealAlpha =
        figure.today && !figure.revealed && figure.revealFrom !== null
          ? Math.min(1, Math.max(0, (frame.time - figure.revealFrom - REVEAL_SECONDS * 0.6) / 0.9))
          : figure.today && !figure.revealed
            ? 0
            : 1;
      figure.label.alpha = labelAlpha * revealAlpha * this.dim(id);
      figure.label.position.set(Math.round(p.x), Math.round(p.y + 18));
      const title = figure.label.children[1] as Text;
      if (figure.loaded.file.status === "complete") {
        const size = Math.min(34, Math.max(18, 26 * frame.cam.zoom ** 0.3));
        title.scale.set(size / TITLE_FONT_SIZE);
      }
    }
  }

  private dim(id: number) {
    return this.focus !== null && id !== this.focus ? 0.5 : 1;
  }

  private drawLines(figure: Figure, progress: number) {
    const g = figure.lines!;
    const { figure: shape } = figure.loaded.file;
    if (!shape) return;
    g.clear();
    const n = shape.edges.length;
    shape.edges.forEach(([i, j], k) => {
      const local = Math.min(1, Math.max(0, progress * n - k));
      if (local <= 0) return;
      const [ax, ay] = shape.anchors[i];
      const [bx, by] = shape.anchors[j];
      const e = ease(local);
      g.moveTo(ax, ay).lineTo(ax + (bx - ax) * e, ay + (by - ay) * e);
    });
    g.stroke({
      width: 1,
      pixelLine: true,
      color: figure.today ? COLORS.gold : COLORS.line,
      alpha: figure.today ? 0.7 : 0.28,
    });
  }

  private createLabel(figure: Figure) {
    const { file } = figure.loaded;
    const complete = file.status === "complete";
    const number = toRoman(file.id);
    const eyebrowText = complete
      ? `CONSTELACIÓN ${number}${figure.today ? " · HOY" : ""}`
      : `CONSTELACIÓN ${number} · EN FORMACIÓN`;
    const eyebrow = new Text({
      text: eyebrowText,
      resolution: 2,
      style: {
        fontFamily: this.fonts.mono,
        fontSize: 11,
        fontWeight: "500",
        letterSpacing: 1.4,
        fill: figure.today || !complete ? CSS.gold : CSS.ink2,
      },
    });
    eyebrow.anchor.set(0.5, 0);
    const title = complete
      ? new Text({
          text: file.name ?? "",
          resolution: 2,
          style: {
            fontFamily: this.fonts.display,
            fontSize: TITLE_FONT_SIZE,
            fontWeight: "600",
            fill: CSS.ink,
          },
        })
      : new Text({
          text: `${file.count} de 300 estrellas`,
          resolution: 2,
          style: { fontFamily: this.fonts.mono, fontSize: 12, fill: CSS.ink2 },
        });
    title.anchor.set(0.5, 0);
    title.position.set(0, 18);
    const label = new Container();
    label.addChild(eyebrow, title);
    this.labels.addChild(label);
    return label;
  }
}
