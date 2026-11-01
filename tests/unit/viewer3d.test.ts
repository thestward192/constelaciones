import { describe, expect, it } from "vitest";
import { extrasChips, LEVEL_LOOKS, PLANET_LOOKS, starExtras } from "@/viewer3d/params";

describe("3D looks", () => {
  it("follow table 7.1 of the design document", () => {
    expect(LEVEL_LOOKS.map((l) => l.size)).toEqual([0.55, 0.78, 0.95, 1.18, 1.5, 1.3, 1.15]);
    expect(LEVEL_LOOKS[4].pulse).toBe(true); // Supergigante: pulsing corona
    expect(LEVEL_LOOKS[5].spikes).toBe(2); // Nova: cross (4 flares as 2 crossing streaks)
    expect(LEVEL_LOOKS[6].spikes).toBe(4); // Supernova: 8 flares (4 crossing streaks)
    expect(LEVEL_LOOKS[6].shockwave).toBe(true);
    expect(LEVEL_LOOKS.slice(0, 6).some((l) => l.shockwave)).toBe(false);
  });

  it("has a look for every planet, lit from one side", () => {
    const names = [
      "Mercurio",
      "Venus",
      "Tierra",
      "Marte",
      "Júpiter",
      "Saturno",
      "Urano",
      "Neptuno",
    ];
    expect(Object.keys(PLANET_LOOKS)).toEqual(names);
    expect(Object.values(PLANET_LOOKS).every((p) => p.lit && p.corona === 0)).toBe(true);
    expect(PLANET_LOOKS.Saturno.planetRings).toBe(true);
  });
});

describe("3D extras", () => {
  it.each([
    [0, 0, { rings: 0, satellite: false, crown: false, comet: false }],
    [5, 0, { rings: 1, satellite: false, crown: false, comet: false }],
    [25, 1, { rings: 2, satellite: false, crown: false, comet: true }],
    [100, 0, { rings: 3, satellite: true, crown: false, comet: false }],
    [500, 2, { rings: 3, satellite: true, crown: true, comet: true }],
  ])("%i invited, %i shooting", (invited, shooting, extras) => {
    expect(starExtras(invited, shooting)).toEqual(extras);
  });

  it("describes them in words", () => {
    expect(extrasChips(0, 0)).toEqual([]);
    expect(extrasChips(1, 0)).toEqual(["1 hilo de luz"]);
    expect(extrasChips(120, 1)).toEqual([
      "3 anillos · 120 invitados",
      "Satélite",
      "Estela de estrella fugaz",
    ]);
  });
});
