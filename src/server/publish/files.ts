import { createHash } from "node:crypto";
import { invitationRewards, levelForDays } from "../../sky";

// Formats of the public files (docs/constelaciones-implementacion.md, section 4).
// Compact arrays instead of objects keep them small; the map reads them by position.

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

export const STAGES: [string, number][] = [
  ["Nuestro Cielo", 88],
  ["La Vía Láctea", 1000],
  ["El Universo", 10000],
];

export interface StarRow {
  slot_index: number;
  username: string;
  x: number;
  y: number;
  days_count: number;
  invited_count: number;
  shooting_days: number[];
  gold_border: boolean;
}

export interface ConstellationRow {
  id: number;
  name: string | null;
  status: string;
  star_count: number;
  completed_day: number | null;
  center_x: number;
  center_y: number;
  scale: number;
  file_version: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function starTuple(s: StarRow): StarTuple {
  const rewards = invitationRewards(s.invited_count);
  return [
    s.slot_index,
    s.username,
    round1(s.x),
    round1(s.y),
    levelForDays(s.days_count),
    rewards.crown ? 4 : rewards.rings,
    s.shooting_days.length,
    s.gold_border ? 1 : 0,
  ];
}

export function buildConstellationFile(
  c: ConstellationRow,
  version: number,
  stars: StarRow[],
  figure: {
    anchors: { anchor_index: number; x: number; y: number }[];
    edges: [number, number][];
  } | null,
): ConstellationFile {
  const complete = c.status === "complete";
  const anchors = figure
    ? [...figure.anchors]
        .sort((a, b) => a.anchor_index - b.anchor_index)
        .map((a) => [round1(a.x), round1(a.y)] as [number, number])
    : [];
  return {
    id: c.id,
    v: version,
    status: complete ? "complete" : "forming",
    name: complete ? c.name : null,
    figure: complete && figure ? { anchors, edges: figure.edges } : null,
    count: c.star_count,
    completedDay: c.completed_day,
    stars: [...stars].sort((a, b) => a.slot_index - b.slot_index).map(starTuple),
  };
}

export function indexConstellation(c: ConstellationRow): IndexConstellation {
  const complete = c.status === "complete";
  return [
    c.id,
    Math.round(c.center_x),
    Math.round(c.center_y),
    Math.round(c.scale),
    complete ? c.name : null,
    complete ? 1 : 0,
    c.file_version,
    c.completed_day,
    c.star_count,
  ];
}

/** Hash of the index content, ignoring its version and timestamp: equal hash, nothing to publish. */
export function indexHash(index: Omit<SkyIndex, "v" | "generatedAt">): string {
  return createHash("sha256").update(JSON.stringify(index)).digest("hex");
}

export const paths = {
  latest: "sky/latest.json",
  index: (v: number) => `sky/index.v${v}.json`,
  overview: (v: number) => `sky/overview.v${v}.webp`,
  constellation: (id: number, v: number) => `c/${id}.v${v}.json`,
};
