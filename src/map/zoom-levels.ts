// Zoom levels (docs/constelaciones-diseno.md, 5.2). What the map draws depends on the zoom;
// layers cross-fade around each threshold instead of switching abruptly.

export const ZOOM_LEVELS = ["universe", "region", "constellation", "star", "name"] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

export const ZOOM_LEVEL_LABELS: Record<ZoomLevel, string> = {
  universe: "Universo",
  region: "Región",
  constellation: "Constelación",
  star: "Estrella",
  name: "Nombre",
};

/** Lower zoom bound of each level (screen px per world unit). */
export const ZOOM_THRESHOLDS: Record<Exclude<ZoomLevel, "universe">, number> = {
  region: 0.03,
  constellation: 0.2,
  star: 0.9,
  name: 2.5,
};

/** Cross-fades span this factor on each side of a threshold (×/÷ 1.25). */
const FADE = Math.log(1.25);

export function zoomLevel(zoom: number): ZoomLevel {
  if (zoom >= ZOOM_THRESHOLDS.name) return "name";
  if (zoom >= ZOOM_THRESHOLDS.star) return "star";
  if (zoom >= ZOOM_THRESHOLDS.constellation) return "constellation";
  if (zoom >= ZOOM_THRESHOLDS.region) return "region";
  return "universe";
}

/** 0 well below the threshold, 1 well above it, smooth in between. */
export function fadeIn(zoom: number, threshold: number): number {
  const t = (Math.log(zoom) - Math.log(threshold) + FADE) / (2 * FADE);
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

export interface LayerWeights {
  /** Spiral image (cloud of light). */
  overview: number;
  /** One glow and number per constellation. */
  regionDots: number;
  /** Real stars and constellation lines. */
  stars: number;
  /** Constellation names under each figure. */
  constellationLabels: number;
  /** Rings, trails and flares on stars. */
  starDetails: number;
  /** @usernames next to each star. */
  names: number;
  /** Planet names and goals around the orbits. */
  planetLabels: number;
}

export function layerWeights(zoom: number): LayerWeights {
  const region = fadeIn(zoom, ZOOM_THRESHOLDS.region);
  const constellation = fadeIn(zoom, ZOOM_THRESHOLDS.constellation);
  return {
    overview: (1 - region * 0.85) * (1 - constellation),
    regionDots: region * (1 - constellation),
    stars: constellation,
    constellationLabels: constellation * (1 - fadeIn(zoom, 6)),
    starDetails: fadeIn(zoom, 0.7),
    names: fadeIn(zoom, ZOOM_THRESHOLDS.name),
    planetLabels: 1 - constellation,
  };
}

/** Star files are needed from where stars start fading in. */
export const LOAD_FROM_ZOOM = ZOOM_THRESHOLDS.constellation / 1.25;
