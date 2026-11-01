import { createHash } from "node:crypto";
import { invitationRewards, levelForDays } from "../../sky";
import type {
  ConstellationFile,
  IndexConstellation,
  SkyIndex,
  StarTuple,
} from "../../sky/public-files";

export { paths } from "../../sky/public-files";
export type {
  ConstellationFile,
  IndexConstellation,
  SkyIndex,
  StarTuple,
} from "../../sky/public-files";

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
