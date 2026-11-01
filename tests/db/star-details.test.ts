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
    insert into stars (id, username, x, y, born_day, last_day, days_count, invited_count, shooting_days, status) values
      (1, 'ana', 10, 20, 1, 2, 7, 3, '{2}', 'active'),
      (2, 'leo', 30, 40, 1, 1, 1, 0, '{}', 'active'),
      (3, 'pau', 50, 60, 2, 2, 1, 0, '{}', 'active'),
      (4, 'oculta', 70, 80, 2, 2, 1, 0, '{}', 'review');
    update stars set invited_by = 1 where id in (2, 3, 4);
  `);
});

const details = (q: string) =>
  asRole(pg, "anon", () =>
    pg.query<{ d: Record<string, unknown> | null }>("select star_details($1) as d", [q]),
  ).then((r) => r.rows[0].d);

describe("star_details", () => {
  it("returns the card data of a public star, with its light threads", async () => {
    const ana = await details(" @Ana ");
    expect(ana).toMatchObject({
      username: "ana",
      x: 10,
      y: 20,
      bornDay: 1,
      days: 7,
      level: 2,
      invitedCount: 3,
      shootingDays: [2],
      invitedBy: null,
    });
    // Threads only to public stars, most recent first.
    expect((ana!.invited as { username: string }[]).map((i) => i.username)).toEqual(["pau", "leo"]);
  });

  it("shows who invited a star", async () => {
    expect((await details("leo"))!.invitedBy).toEqual({ username: "ana", x: 10, y: 20 });
  });

  it("never reveals a star in review", async () => {
    expect(await details("oculta")).toBeNull();
    expect(await details("nadie")).toBeNull();
  });
});
