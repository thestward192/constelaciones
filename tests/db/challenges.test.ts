import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, applySeeds } from "../../scripts/db/runner";
import { asRole, createTestDatabase } from "./pglite";

// Each challenge type with a small fake sky:
//   day 1: ana, leo, mia, teo are born (4 new stars)
//   day 2: ana and leo come back; pau (invited by ana) and rui (invited by leo) are born;
//          constellation 2 completes
//   day 3 (video at 18:00): ana comes back for the 3rd day (reaches Enana roja); sol is born at
//          18:20, eva at 19:30; leo invited eva

let pg: PGlite;

beforeEach(async () => {
  const test = await createTestDatabase();
  pg = test.pg;
  await applyMigrations(test.db);
  await applySeeds(test.db);
  await pg.exec(`
    insert into days (day, published_at) values
      (1, '2026-11-01T18:00:00Z'), (2, '2026-11-02T18:00:00Z'), (3, '2026-11-03T18:00:00Z');
    insert into constellations (id, figure_id, center_x, center_y, scale, rotation, status, star_count, completed_day, dirty) values
      (1, 1, 0, 0, 280, 0, 'forming', 7, null, false),
      (2, 2, 900, 0, 280, 0, 'complete', 300, 2, false);
    insert into stars (id, username, constellation_id, slot_index, born_day, last_day, days_count, invited_by) values
      (1, 'ana', 1, 0, 1, 3, 3, null),
      (2, 'leo', 1, 1, 1, 2, 2, null),
      (3, 'mia', 1, 2, 1, 1, 1, null),
      (4, 'teo', 1, 3, 1, 1, 1, null),
      (5, 'pau', 1, 4, 2, 2, 1, 1),
      (6, 'rui', 1, 5, 2, 2, 1, 2),
      (7, 'sol', 1, 6, 3, 3, 1, null),
      (8, 'eva', 1, 7, 3, 3, 1, 2);
    insert into participations (star_id, day, first_at) values
      (1, 1, '2026-11-01T18:05:00Z'), (2, 1, '2026-11-01T18:06:00Z'),
      (3, 1, '2026-11-01T18:07:00Z'), (4, 1, '2026-11-01T20:00:00Z'),
      (1, 2, '2026-11-02T18:10:00Z'), (2, 2, '2026-11-02T18:11:00Z'),
      (5, 2, '2026-11-02T18:12:00Z'), (6, 2, '2026-11-02T21:00:00Z'),
      (1, 3, '2026-11-03T18:10:00Z'), (7, 3, '2026-11-03T18:20:00Z'), (8, 3, '2026-11-03T19:30:00Z');
  `);
});

const one = async <T>(sql: string, params: unknown[] = []) =>
  (await pg.query<T>(sql, params)).rows[0];

async function progress(day: number, type: string, goal = 1, level = 2) {
  await pg.query(
    "update days set challenge_type = $2, challenge_goal = $3, challenge_level = $4 where day = $1",
    [day, type, goal, level],
  );
  return (await one<{ p: number }>("select challenge_progress($1) as p", [day])).p;
}

describe("challenge progress", () => {
  it("cantidad counts the constellations completed that day", async () => {
    expect(await progress(2, "cantidad")).toBe(1);
    expect(await progress(1, "cantidad")).toBe(0);
  });

  it("velocidad counts new stars within an hour of the video", async () => {
    expect(await progress(1, "velocidad")).toBe(3); // teo came at 20:00
    expect(await progress(3, "velocidad")).toBe(1); // sol yes, eva at 19:30 no, ana is not new
    await pg.query("update days set published_at = null where day = 3");
    expect(await progress(3, "velocidad")).toBe(0);
  });

  it("regreso counts people who already had a star", async () => {
    expect(await progress(1, "regreso")).toBe(0);
    expect(await progress(2, "regreso")).toBe(2);
    expect(await progress(3, "regreso")).toBe(1);
  });

  it("invitacion counts the invitations resolved that day", async () => {
    expect(await progress(2, "invitacion")).toBe(2);
    expect(await progress(3, "invitacion")).toBe(1);
  });

  it("racha counts people who reached the level that day", async () => {
    expect(await progress(3, "racha", 1, 1)).toBe(1); // ana's 3rd day: Enana roja
    expect(await progress(2, "racha", 1, 1)).toBe(0); // nobody had 3 days yet
    expect(await progress(3, "racha", 1, 2)).toBe(0); // nobody reaches Estrella amarilla
  });

  it("record counts new stars and aims at the best earlier day plus one", async () => {
    expect(await progress(3, "record")).toBe(2);
    await pg.query("select refresh_challenge(3)");
    const day = await one<{ challenge_goal: number; challenge_progress: number }>(
      "select challenge_goal, challenge_progress from days where day = 3",
    );
    expect(day).toEqual({ challenge_goal: 5, challenge_progress: 2 }); // best was day 1 with 4
  });

  it("a day without a challenge has no progress", async () => {
    expect((await one<{ p: number }>("select challenge_progress(1) as p")).p).toBe(0);
  });
});

describe("closing a day", () => {
  it("marks the challenge met and creates its unlock once", async () => {
    await progress(2, "cantidad", 1);
    const result = await one<{ r: Record<string, unknown> }>("select close_day(2) as r");
    expect(result.r).toMatchObject({ met: true, unlock: "aurora", progress: 1, goal: 1 });
    const day = await one(
      "select closed, challenge_met, challenge_progress from days where day = 2",
    );
    expect(day).toEqual({ closed: true, challenge_met: true, challenge_progress: 1 });

    // Reopening and closing again keeps a single unlock.
    await pg.query("update days set closed = false where day = 2");
    await pg.query("select close_day(2)");
    const unlocks = await pg.query("select day, type from unlocks");
    expect(unlocks.rows).toEqual([{ day: 2, type: "aurora" }]);
  });

  it("gives nothing when the goal was not reached", async () => {
    await progress(1, "regreso", 10);
    const result = await one<{ r: Record<string, unknown> }>("select close_day(1) as r");
    expect(result.r).toMatchObject({ met: false, unlock: null });
    expect((await one<{ c: number }>("select count(*)::int as c from unlocks")).c).toBe(0);
    expect(await one("select challenge_met from days where day = 1")).toEqual({
      challenge_met: false,
    });
  });

  it("a met invitation challenge gives the inviters a gold border", async () => {
    await progress(2, "invitacion", 2);
    const result = await one<{ r: Record<string, unknown> }>("select close_day(2) as r");
    expect(result.r).toMatchObject({ met: true, unlock: "borde_dorado", goldBorders: 2 });
    const gold = await pg.query("select username from stars where gold_border order by id");
    expect(gold.rows).toEqual([{ username: "ana" }, { username: "leo" }]);
    // Their constellation has to be published again.
    expect(await one("select dirty from constellations where id = 1")).toEqual({ dirty: true });
  });

  it("maps every type to its unlock, and a record nebula gets its own color", async () => {
    const expected: Record<string, string> = {
      cantidad: "aurora",
      velocidad: "cometa",
      regreso: "luna",
      invitacion: "borde_dorado",
      racha: "lluvia",
      record: "nebulosa",
    };
    for (const [type, unlock] of Object.entries(expected)) {
      await pg.query("delete from unlocks");
      await pg.query("update days set closed = false, challenge_met = null where day = 3");
      // Goal 0 is not allowed, so mark the day met to test only the mapping.
      await progress(3, type, 1, 1);
      await pg.query("update days set challenge_met = true where day = 3");
      const r = (await one<{ r: { unlock: string } }>("select close_day(3) as r")).r;
      expect(r.unlock).toBe(unlock);
    }
    const nebula = await one<{ params: { hue: number } }>("select params from unlocks");
    expect(nebula.params.hue).toBeCloseTo((3 * 137.508) % 360, 1);
  });

  it("a day without a challenge just closes", async () => {
    const result = await one<{ r: Record<string, unknown> }>("select close_day(1) as r");
    expect(result.r).toEqual({ day: 1, challenge: false });
    expect(await one("select closed from days where day = 1")).toEqual({ closed: true });
  });

  it("the progress of a closed day no longer changes", async () => {
    await progress(3, "regreso", 1);
    await pg.query("select close_day(3)");
    await pg.query("insert into participations (star_id, day) values (2, 3)");
    await pg.query("select refresh_challenge(3)");
    expect(await one("select challenge_progress from days where day = 3")).toEqual({
      challenge_progress: 1,
    });
  });

  it("none of this is callable with the public key", async () => {
    for (const sql of [
      "select challenge_progress(1)",
      "select refresh_challenge(1)",
      "select close_day(1)",
      "select best_day_before(1)",
    ]) {
      await expect(asRole(pg, "anon", () => pg.query(sql))).rejects.toThrow(/permission denied/);
    }
  });
});
