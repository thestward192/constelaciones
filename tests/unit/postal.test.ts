import { describe, expect, it } from "vitest";
import { constellationSvg, postalTexts, usernameFontSize } from "@/server/postal/layout";
import type { ConstellationFile } from "@/sky/public-files";

const file: ConstellationFile = {
  id: 23,
  v: 1,
  status: "complete",
  name: "El Colibrí",
  figure: {
    anchors: [
      [0, 0],
      [100, 50],
    ],
    edges: [[0, 1]],
  },
  count: 3,
  completedDay: 4,
  stars: [
    [0, "ana", 0, 0, 0, 0, 0, 0],
    [1, "leo", 100, 50, 3, 0, 0, 0],
    [2, "pau", 40, 80, 6, 0, 0, 0],
  ],
};

describe("postal texts", () => {
  it("follow section 8 of the design document", () => {
    expect(postalTexts("leo", file, 1, 2, 3)).toEqual({
      username: "@leo",
      constellation: "Constelación XXIII · El Colibrí",
      details: "Estrella 002 · Día 2 · Gigante azul",
    });
  });

  it("do not reveal the name of a constellation still forming", () => {
    const forming = { ...file, status: "forming" as const, name: null };
    expect(postalTexts("leo", forming, 0, 1, 0).constellation).toBe(
      "Constelación XXIII · En formación",
    );
  });
});

describe("username size", () => {
  it("keeps short names big and shrinks long ones so they fit", () => {
    expect(usernameFontSize("ana")).toBe(68);
    const long = "a".repeat(30);
    const size = usernameFontSize(long);
    expect(size).toBeLessThan(68);
    expect((long.length + 1) * 0.6 * size).toBeLessThanOrEqual(940 + 1);
  });
});

describe("constellation drawing", () => {
  const leo = { username: "leo", x: 100, y: 50, level: 3 };
  const svg = constellationSvg(file, leo, 900);

  it("draws every star, the lines and a double gold circle on the person's star", () => {
    expect(svg.match(/fill="url\(#l\d\)"/g)?.length).toBe(3); // 2 other stars + the highlighted one
    expect(svg.match(/<line /g)?.length).toBe(1);
    expect(svg.match(/stroke="#e8cb8f"/g)?.length).toBe(2);
  });

  it("draws no lines for a constellation still forming", () => {
    const forming = constellationSvg({ ...file, status: "forming", figure: null }, leo, 900);
    expect(forming).not.toContain("<line");
  });

  it("marks the star even when the file does not include it yet", () => {
    const newcomer = constellationSvg(file, { username: "nueva", x: 60, y: 20, level: 0 }, 900);
    expect(newcomer.match(/stroke="#e8cb8f"/g)?.length).toBe(2);
    expect(newcomer.match(/fill="url\(#l\d\)"/g)?.length).toBe(4); // 3 stars + the newcomer
  });

  it("keeps every star inside the drawing", () => {
    for (const [, x, y] of svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)) {
      expect(Number(x)).toBeGreaterThanOrEqual(0);
      expect(Number(x)).toBeLessThanOrEqual(900);
      expect(Number(y)).toBeGreaterThanOrEqual(0);
      expect(Number(y)).toBeLessThanOrEqual(900);
    }
  });
});
