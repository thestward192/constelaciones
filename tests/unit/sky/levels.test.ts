import { describe, expect, it } from "vitest";
import { invitationRewards, LEVELS, levelForDays, nextLevel } from "@/sky/levels";

describe("levels", () => {
  it.each([
    [1, "Chispa"],
    [2, "Chispa"],
    [3, "Enana roja"],
    [6, "Enana roja"],
    [7, "Estrella amarilla"],
    [15, "Gigante azul"],
    [29, "Gigante azul"],
    [30, "Supergigante"],
    [100, "Nova"],
    [364, "Nova"],
    [365, "Supernova"],
  ])("%i days → %s", (days, name) => {
    expect(LEVELS[levelForDays(days)].name).toBe(name);
  });

  it("says how many days are left for the next level", () => {
    expect(nextLevel(1)).toEqual({ level: LEVELS[1], daysLeft: 2 });
    expect(nextLevel(12)).toEqual({ level: LEVELS[3], daysLeft: 3 });
    expect(nextLevel(364)).toEqual({ level: LEVELS[6], daysLeft: 1 });
    expect(nextLevel(365)).toBeNull();
  });
});

describe("invitation rewards", () => {
  it.each([
    [0, { thread: false, rings: 0, satellite: false, crown: false }],
    [1, { thread: true, rings: 0, satellite: false, crown: false }],
    [5, { thread: true, rings: 1, satellite: false, crown: false }],
    [24, { thread: true, rings: 1, satellite: false, crown: false }],
    [25, { thread: true, rings: 2, satellite: false, crown: false }],
    [100, { thread: true, rings: 3, satellite: true, crown: false }],
    [500, { thread: true, rings: 3, satellite: true, crown: true }],
  ])("%i invited", (count, rewards) => {
    expect(invitationRewards(count)).toEqual(rewards);
  });
});
