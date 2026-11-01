// Writes a complete fake sky as public files under public/dev-sky (git-ignored), to develop and
// measure the map without touching Supabase: 10,000 constellations, 3,000,000 stars by default.
// Usage: npm run fake-sky -- [--constellations 10000]
// Then open http://localhost:3000/?sky=/dev-sky (the override only works in development).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readFigures } from "./db/runner";
import {
  buildConstellationFile,
  indexConstellation,
  STAGES,
  type StarRow,
} from "../src/server/publish/files";
import { renderOverview } from "../src/server/publish/overview";
import {
  constellationPlacement,
  createRng,
  figureForConstellation,
  generateSlots,
  planetOrbitRadius,
  STARS_PER_CONSTELLATION,
} from "../src/sky";
import { paths, type SkyIndex } from "../src/sky/public-files";

const { values } = parseArgs({ options: { constellations: { type: "string", default: "10000" } } });
const COUNT = Number(values.constellations);
const DAY = 365;
const out = join(import.meta.dirname, "..", "public", "dev-sky");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "c"), { recursive: true });
mkdirSync(join(out, "sky"), { recursive: true });

const figures = readFigures().map((f, i) => ({ ...f, id: i + 1 }));
const rng = createRng("fake-sky");
const syllables = [
  "lu",
  "na",
  "so",
  "fi",
  "da",
  "ni",
  "va",
  "le",
  "ma",
  "ri",
  "jo",
  "se",
  "pa",
  "ca",
  "mi",
  "to",
  "ra",
  "kev",
  "sol",
  "mar",
  "cr",
  "506",
];
const username = (id: number, slot: number) => {
  const parts = Array.from({ length: 2 + rng.int(3) }, () => syllables[rng.int(syllables.length)]);
  return `${parts.join(["", "_", "."][rng.int(3)])}${id}x${slot}`.slice(0, 30);
};
// Mostly sparks, a long tail of loyal commenters.
const daysFor = () => {
  const u = rng.next();
  if (u < 0.55) return 1 + rng.int(2);
  if (u < 0.8) return 3 + rng.int(4);
  if (u < 0.92) return 7 + rng.int(8);
  if (u < 0.975) return 15 + rng.int(15);
  if (u < 0.995) return 30 + rng.int(70);
  return 100 + rng.int(300);
};

const rows = [];
const shootingNames: string[] = [];
const started = performance.now();
for (let id = 1; id <= COUNT; id++) {
  const { figure } = figureForConstellation(id, figures);
  const placement = constellationPlacement(id);
  const slots = generateSlots(figure, placement, id);
  const forming = id === COUNT;
  const count = forming ? 187 : STARS_PER_CONSTELLATION;
  const completedDay = forming ? null : Math.min(DAY, 1 + Math.floor(((id - 1) * DAY) / COUNT));
  const stars: StarRow[] = slots.slice(0, count).map((s) => ({
    slot_index: s.slotIndex,
    username: username(id, s.slotIndex),
    x: s.x,
    y: s.y,
    days_count: daysFor(),
    invited_count: rng.next() < 0.03 ? [5, 25, 100, 500][rng.int(4)] : rng.int(3),
    shooting_days: rng.next() < 0.01 ? [1 + rng.int(DAY)] : [],
    gold_border: rng.next() < 0.004,
  }));
  if (completedDay === DAY && shootingNames.length < 10)
    shootingNames.push(stars[rng.int(stars.length)].username);
  const row = {
    id,
    name: figure.name,
    status: forming ? "forming" : "complete",
    star_count: count,
    completed_day: completedDay,
    center_x: placement.x,
    center_y: placement.y,
    scale: placement.scale,
    file_version: 1,
  };
  const anchors = slots
    .filter((s) => s.isAnchor)
    .map((s) => ({ anchor_index: s.anchorIndex!, x: s.x, y: s.y }));
  const file = buildConstellationFile(
    row,
    1,
    stars,
    forming ? null : { anchors, edges: figure.edges },
  );
  writeFileSync(join(out, paths.constellation(id, 1)), JSON.stringify(file));
  rows.push(row);
  if (id % 1000 === 0)
    console.log(`${id} constelaciones (${((performance.now() - started) / 1000).toFixed(0)} s)`);
}

const { image, radius } = await renderOverview(
  rows.map((r) => ({
    x: r.center_x,
    y: r.center_y,
    r: r.scale,
    count: r.star_count,
    complete: r.status === "complete",
  })),
);
writeFileSync(join(out, paths.overview(1)), image);

const totalStars = (COUNT - 1) * STARS_PER_CONSTELLATION + 187;
const thresholds: [string, number][] = [
  ["Mercurio", 1000],
  ["Venus", 2500],
  ["Tierra", 5000],
  ["Marte", 10000],
  ["Júpiter", 26400],
  ["Saturno", 100000],
  ["Urano", 300000],
  ["Neptuno", 1000000],
];
const index: SkyIndex = {
  v: 1,
  generatedAt: new Date().toISOString(),
  day: DAY,
  totalStars,
  totalConstellations: COUNT - 1,
  stage: COUNT - 1 >= 1000 ? 3 : COUNT - 1 >= 88 ? 2 : 1,
  stages: STAGES,
  sun: [0, 0],
  planets: thresholds.map(([name, threshold], i) => [
    i + 1,
    name,
    threshold,
    Math.round(planetOrbitRadius(threshold)),
    threshold <= totalStars ? Math.max(1, Math.round((DAY * threshold) / totalStars)) : null,
  ]),
  challenge: { day: DAY, type: "cantidad", goal: 30, progress: 27, met: null },
  shooting: shootingNames,
  unlocks: [
    { day: DAY - 1, type: "aurora", params: null },
    { day: DAY - 3, type: "cometa", params: null },
    { day: DAY - 5, type: "luna", params: null },
    { day: DAY - 8, type: "lluvia", params: null },
    { day: DAY - 12, type: "nebulosa", params: null },
  ],
  overview: { path: paths.overview(1), radius: Math.round(radius) },
  constellations: rows.map(indexConstellation),
};
writeFileSync(join(out, paths.index(1)), JSON.stringify(index));
writeFileSync(join(out, paths.latest), JSON.stringify({ index: paths.index(1) }));
console.log(
  `Listo: ${COUNT} constelaciones, ${totalStars.toLocaleString("es")} estrellas en public/dev-sky`,
);
