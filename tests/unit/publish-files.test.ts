import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readFigures } from "../../scripts/db/runner";
import {
  buildConstellationFile,
  indexConstellation,
  indexHash,
  paths,
  starTuple,
  STAGES,
  type ConstellationRow,
  type SkyIndex,
  type StarRow,
} from "@/server/publish/files";
import { renderOverview } from "@/server/publish/overview";
import { constellationPlacement, createRng, figureForConstellation } from "@/sky";

const star = (overrides: Partial<StarRow> = {}): StarRow => ({
  slot_index: 0,
  username: "luna",
  x: 1.234,
  y: -5.678,
  days_count: 1,
  invited_count: 0,
  shooting_days: [],
  gold_border: false,
  ...overrides,
});

const constellation = (overrides: Partial<ConstellationRow> = {}): ConstellationRow => ({
  id: 3,
  name: "La Ola",
  status: "complete",
  star_count: 300,
  completed_day: 4,
  center_x: 1234.56,
  center_y: -987.65,
  scale: 280.4,
  file_version: 2,
  ...overrides,
});

const kb = (text: string) => gzipSync(text, { level: 9 }).length / 1024;

describe("star tuples", () => {
  it("encode level, rings, shooting stars and gold border", () => {
    expect(starTuple(star())).toEqual([0, "luna", 1.2, -5.7, 0, 0, 0, 0]);
    expect(
      starTuple(
        star({ days_count: 15, invited_count: 25, shooting_days: [3, 9], gold_border: true }),
      ),
    ).toEqual([0, "luna", 1.2, -5.7, 3, 2, 2, 1]);
    expect(starTuple(star({ invited_count: 120 }))[5]).toBe(3);
    expect(starTuple(star({ invited_count: 500 }))[5]).toBe(4);
  });
});

describe("constellation file", () => {
  const anchors = [
    { anchor_index: 1, x: 10.04, y: 20 },
    { anchor_index: 0, x: 1, y: 2 },
  ];

  it("reveals the name and the figure only when complete", () => {
    const file = buildConstellationFile(
      constellation(),
      3,
      [star({ slot_index: 5 }), star({ slot_index: 1, username: "ana" })],
      {
        anchors,
        edges: [[0, 1]],
      },
    );
    expect(file).toMatchObject({
      id: 3,
      v: 3,
      status: "complete",
      name: "La Ola",
      count: 300,
      completedDay: 4,
    });
    expect(file.figure).toEqual({
      anchors: [
        [1, 2],
        [10, 20],
      ],
      edges: [[0, 1]],
    });
    expect(file.stars.map((s) => s[0])).toEqual([1, 5]);
  });

  it("keeps a forming constellation as loose stars, without name or lines", () => {
    const file = buildConstellationFile(
      constellation({ status: "forming", star_count: 187, completed_day: null }),
      1,
      [star()],
      { anchors, edges: [[0, 1]] },
    );
    expect(file.status).toBe("forming");
    expect(file.name).toBeNull();
    expect(file.figure).toBeNull();
    expect(file.count).toBe(187);
  });
});

describe("index", () => {
  it("lists constellations compactly and hides the name of the forming one", () => {
    expect(indexConstellation(constellation())).toEqual([
      3,
      1235,
      -988,
      280,
      "La Ola",
      1,
      2,
      4,
      300,
    ]);
    expect(
      indexConstellation(
        constellation({ status: "forming", star_count: 12, completed_day: null }),
      )[4],
    ).toBeNull();
  });

  it("hashes content, so an unchanged sky is not published again", () => {
    const a = { ...emptyIndex(), totalStars: 10 };
    expect(indexHash(a)).toBe(indexHash({ ...a }));
    expect(indexHash(a)).not.toBe(indexHash({ ...a, totalStars: 11 }));
  });

  it("uses versioned paths", () => {
    expect(paths.index(7)).toBe("sky/index.v7.json");
    expect(paths.constellation(23, 4)).toBe("c/23.v4.json");
    expect(paths.overview(7)).toBe("sky/overview.v7.webp");
  });
});

function emptyIndex(): Omit<SkyIndex, "v" | "generatedAt"> {
  return {
    day: 365,
    totalStars: 3_000_000,
    totalConstellations: 10_000,
    stage: 3,
    stages: STAGES,
    sun: [0, 0],
    planets: [],
    challenge: null,
    shooting: [],
    unlocks: [],
    overview: null,
    constellations: [],
  };
}

const figures = readFigures().map((f, i) => ({ ...f, id: i + 1 }));
const tenThousand = Array.from({ length: 10_000 }, (_, i) => {
  const id = i + 1;
  const p = constellationPlacement(id);
  return constellation({
    id,
    name: figureForConstellation(id, figures).figure.name,
    center_x: p.x,
    center_y: p.y,
    scale: p.scale,
    completed_day: 1 + Math.floor(id / 28),
    file_version: 1 + (id % 9),
  });
});

describe("sizes (docs/constelaciones-implementacion.md, section 4)", () => {
  it("index with 10,000 constellations stays under 300 KB compressed", () => {
    const index: SkyIndex = {
      v: 9999,
      generatedAt: new Date().toISOString(),
      ...emptyIndex(),
      constellations: tenThousand.map(indexConstellation),
    };
    const size = kb(JSON.stringify(index));
    console.log(`index, 10,000 constellations: ${size.toFixed(0)} KB gzip`);
    expect(size).toBeLessThan(300);
  });

  it.each([
    ["typical names", 16],
    ["30-character names", 30],
  ])("constellation file with 300 stars stays under 15 KB compressed (%s)", (_, length) => {
    const rng = createRng(length, "names");
    const letters = "abcdefghijklmnopqrstuvwxyz0123456789._";
    const stars = Array.from({ length: 300 }, (_, i) =>
      star({
        slot_index: i,
        username: Array.from(
          { length: length - 2 + rng.int(4) },
          () => letters[rng.int(letters.length)],
        )
          .join("")
          .slice(0, 30),
        x: rng.range(-40000, 40000),
        y: rng.range(-40000, 40000),
        days_count: 1 + rng.int(365),
        invited_count: rng.int(30),
        shooting_days: rng.next() < 0.05 ? [1] : [],
      }),
    );
    const anchors = Array.from({ length: 14 }, (_, i) => ({
      anchor_index: i,
      x: rng.range(-40000, 40000),
      y: 1,
    }));
    const file = buildConstellationFile(constellation({ id: 9876 }), 12, stars, {
      anchors,
      edges: [[0, 1]],
    });
    const size = kb(JSON.stringify(file));
    console.log(`constellation file (${length} chars): ${size.toFixed(1)} KB gzip`);
    expect(size).toBeLessThan(15);
  });

  it("spiral image of 10,000 constellations stays under 400 KB", async () => {
    const { image, radius } = await renderOverview(
      tenThousand.map((c) => ({
        x: c.center_x,
        y: c.center_y,
        r: c.scale,
        count: 300,
        complete: true,
      })),
    );
    console.log(
      `overview, 10,000 constellations: ${(image.length / 1024).toFixed(0)} KB, radius ${radius.toFixed(0)}`,
    );
    expect(image.length / 1024).toBeLessThan(400);
    expect(radius).toBeGreaterThan(40_000);
  }, 60_000);
});
