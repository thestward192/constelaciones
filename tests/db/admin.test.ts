import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, applySeeds } from "../../scripts/db/runner";
import { asRole, createTestDatabase } from "./pglite";

let pg: PGlite;

beforeAll(async () => {
  const test = await createTestDatabase();
  pg = test.pg;
  await applyMigrations(test.db);
  await applySeeds(test.db);
  await pg.exec(`
    insert into days (day) values (1), (2);
    insert into constellations (id, figure_id, center_x, center_y, scale, rotation, status, dirty, name)
      values (1, 1, 0, 0, 280, 0, 'forming', false, 'El Colibrí');
    insert into stars (id, username, constellation_id, slot_index, born_day, last_day, days_count, status) values
      (1, 'ana', 1, 0, 1, 2, 2, 'active'),
      (2, 'leo', 1, 1, 2, 2, 1, 'active'),
      (3, 'pau', 1, 2, 2, 2, 1, 'review'),
      (4, 'mia', 1, 3, 1, 1, 1, 'active');
    update stars set invited_by = 1 where id = 2;
    insert into participations (star_id, day) values (1, 1), (4, 1), (1, 2), (2, 2), (3, 2);
    insert into comment_inbox (ig_comment_id, day, username, source, processed) values
      ('a', 2, 'ana', 'manual', true), ('b', 2, 'leo', 'manual', true), ('c', 2, 'nuevo', 'manual', false);
  `);
});

const one = async <T>(sql: string, params: unknown[] = []) =>
  (await pg.query<T>(sql, params)).rows[0];

describe("shooting star draw", () => {
  it("offers only public stars that commented that day", async () => {
    const { c } = await one<{ c: number[] }>("select shooting_candidates(2) as c");
    expect(c.map(Number)).toEqual([1, 2]); // pau is in review
  });

  it("rejects winners who did not comment that day", async () => {
    await expect(pg.query("select record_shooting_draw(2, array[4]::bigint[])")).rejects.toThrow(
      /commented/,
    );
  });

  it("stores the draw once, marks the stars and their constellation", async () => {
    await pg.exec("select record_shooting_draw(2, array[2, 1]::bigint[])");
    const winners = await pg.query<{ star_id: number; rank: number }>(
      "select star_id, rank from shooting_stars where day = 2 order by rank",
    );
    expect(winners.rows.map((w) => [Number(w.star_id), w.rank])).toEqual([
      [2, 1],
      [1, 2],
    ]);
    expect(
      (await one<{ s: number[] }>("select shooting_days as s from stars where id = 1")).s,
    ).toEqual([2]);
    expect(
      (
        await one<{ n: number; at: string | null }>(
          "select shooting_count as n, shooting_drawn_at as at from days where day = 2",
        )
      ).n,
    ).toBe(2);
    expect(
      (await one<{ dirty: boolean }>("select dirty from constellations where id = 1")).dirty,
    ).toBe(true);
  });

  it("can never be repeated for the same day", async () => {
    await expect(pg.query("select record_shooting_draw(2, array[1]::bigint[])")).rejects.toThrow(
      /already drawn/,
    );
    const { n } = await one<{ n: number }>(
      "select count(*)::int as n from shooting_stars where day = 2",
    );
    expect(n).toBe(2);
  });
});

describe("day statistics", () => {
  it("counts comments, new and returning stars, invitations and reviews", async () => {
    const { s } = await one<{ s: Record<string, number> }>("select day_stats(2) as s");
    expect(s).toEqual({
      comments: 3,
      pending: 1,
      participations: 3,
      newStars: 2,
      returning: 1,
      invites: 1,
      review: 1,
      constellationsCompleted: 0,
    });
  });
});

describe("moderation and names", () => {
  it("approves a name and marks its constellation for publishing", async () => {
    await pg.exec("update constellations set dirty = false; select set_star_status(3, 'active')");
    expect((await one<{ status: string }>("select status from stars where id = 3")).status).toBe(
      "active",
    );
    expect(
      (await one<{ dirty: boolean }>("select dirty from constellations where id = 1")).dirty,
    ).toBe(true);
  });

  it("renames a constellation (never to an empty name)", async () => {
    await pg.exec("select rename_constellation(1, '  La Ola Grande ')");
    expect((await one<{ name: string }>("select name from constellations where id = 1")).name).toBe(
      "La Ola Grande",
    );
    await expect(pg.query("select rename_constellation(1, '   ')")).rejects.toThrow(/empty/);
  });

  it("none of this is callable with the public key", async () => {
    for (const sql of [
      "select shooting_candidates(1)",
      "select record_shooting_draw(1, array[1]::bigint[])",
      "select day_stats(1)",
      "select set_star_status(1, 'hidden')",
      "select rename_constellation(1, 'x')",
      "select * from job_runs",
    ]) {
      await expect(asRole(pg, "anon", () => pg.query(sql))).rejects.toThrow(/permission denied/);
    }
  });
});
