// Formats of the public files (docs/constelaciones-implementacion.md, section 4), shared by the
// server that writes them and the map that reads them. Compact arrays instead of objects keep
// them small; they are read by position.
/** Star in a constellation file: [slot, username, x, y, level 0-6, rings 0-4 (4 = crown), shooting count, gold border 0/1] */
export type StarTuple = [number, string, number, number, number, number, number, 0 | 1];

export interface ConstellationFile {
  id: number;
  v: number;
  status: "forming" | "complete";
  /** Hidden until the constellation is complete. */
  name: string | null;
  /** Hidden until complete: anchor positions (the anchor stars) and the lines between them. */
  figure: { anchors: [number, number][]; edges: [number, number][] } | null;
  count: number;
  completedDay: number | null;
  stars: StarTuple[];
}

/** Constellation in the index: [id, x, y, radius, name, status (0 forming, 1 complete), file version, completed day, star count] */
export type IndexConstellation = [
  number,
  number,
  number,
  number,
  string | null,
  0 | 1,
  number,
  number | null,
  number,
];

export interface SkyIndex {
  v: number;
  generatedAt: string;
  day: number | null;
  totalStars: number;
  totalConstellations: number;
  stage: number;
  stages: [string, number][];
  sun: [number, number];
  /** [id, name, threshold, orbit radius, unlocked day] */
  planets: [number, string, number, number, number | null][];
  challenge: {
    day: number;
    type: string;
    goal: number;
    progress: number;
    met: boolean | null;
  } | null;
  shooting: string[];
  unlocks: { day: number; type: string; params: unknown }[];
  overview: { path: string; radius: number } | null;
  constellations: IndexConstellation[];
}

export const paths = {
  latest: "sky/latest.json",
  index: (v: number) => `sky/index.v${v}.json`,
  overview: (v: number) => `sky/overview.v${v}.webp`,
  constellation: (id: number, v: number) => `c/${id}.v${v}.json`,
};
