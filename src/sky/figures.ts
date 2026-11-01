import { createRng, type Rng } from "./random";

/** A stick drawing. Anchors roughly in -1..1 (y down); edges join anchor indexes. */
export interface Figure {
  slug: string;
  name: string;
  anchors: [number, number][];
  edges: [number, number][];
  handmade: boolean;
}

/**
 * Which figure a constellation uses. The first ones use each handmade figure once, in order;
 * after that figures are reused, picked by seed, with a soft deformation so no two look alike.
 */
export function chooseFigure(id: number, figureCount: number): { index: number; varied: boolean } {
  if (id <= figureCount) return { index: id - 1, varied: false };
  return { index: createRng(id, "figure").int(figureCount), varied: true };
}

/** The figure drawn by constellation `id`, already varied when it is a reuse. */
export function figureForConstellation<F extends Figure>(
  id: number,
  figures: F[],
): { figure: F; index: number } {
  const { index, varied } = chooseFigure(id, figures.length);
  const base = figures[index];
  return { figure: varied ? { ...base, ...varyFigure(base, createRng(id, "vary")) } : base, index };
}

/** Soft deformation of a reused figure: mirror, stretch, shear and a gentle wave. */
export function varyFigure(figure: Figure, rng: Rng): Figure {
  const mirror = rng.next() < 0.5 ? -1 : 1;
  const sx = rng.range(0.85, 1.15) * mirror;
  const sy = rng.range(0.85, 1.15);
  const shear = rng.range(-0.15, 0.15);
  const waveAmp = rng.range(0.02, 0.06);
  const waveFreq = rng.range(1.5, 3);
  const phase = rng.range(0, 2 * Math.PI);

  return {
    ...figure,
    anchors: figure.anchors.map(([x, y]) => {
      const wx = x * sx + y * shear;
      const wy = y * sy;
      return [
        wx + waveAmp * Math.sin(waveFreq * wy + phase),
        wy + waveAmp * Math.cos(waveFreq * wx + phase),
      ];
    }),
  };
}
