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
    insert into constellations (id, figure_id, center_x, center_y, scale, rotation, status, dirty) values
      (1, 1, 0, 0, 280, 0, 'complete', true),
      (2, 2, 0, 0, 280, 0, 'forming', true),
      (3, 3, 0, 0, 280, 0, 'reserved', true),
      (4, 4, 0, 0, 280, 0, 'reserved', false);
  `);
});

const value = async <T>(sql: string) => (await pg.query<{ v: T }>(sql)).rows[0].v;

describe("publishing functions", () => {
  it("claims visible changed constellations once, never reserved ones", async () => {
    const first = await pg.query<{ id: number }>(
      "select id from claim_dirty_constellations() order by id",
    );
    expect(first.rows.map((r) => r.id)).toEqual([1, 2]);
    const again = await pg.query("select * from claim_dirty_constellations()");
    expect(again.rows).toHaveLength(0);
  });

  it("lets only one publish hold the lease", async () => {
    expect(await value<boolean>("select claim_publish_lock(60) as v")).toBe(true);
    expect(await value<boolean>("select claim_publish_lock(60) as v")).toBe(false);
    await pg.exec("select release_publish_lock()");
    expect(await value<boolean>("select claim_publish_lock(60) as v")).toBe(true);
    await pg.exec("select release_publish_lock()");
  });

  it("an expired lease can be taken again", async () => {
    await pg.exec("update sky_state set publish_lock_until = now() - interval '1 second' where id");
    expect(await value<boolean>("select claim_publish_lock(60) as v")).toBe(true);
    await pg.exec("select release_publish_lock()");
  });

  it("is not callable with the public key", async () => {
    for (const fn of [
      "claim_dirty_constellations()",
      "claim_publish_lock(60)",
      "release_publish_lock()",
      "process_inbox(10)",
    ]) {
      await expect(asRole(pg, "anon", () => pg.query(`select ${fn}`))).rejects.toThrow(
        /permission denied/,
      );
    }
  });
});
