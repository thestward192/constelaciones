import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, applySeeds, migrationFiles, readFigures } from "../../scripts/db/runner";
import { asRole, createTestDatabase } from "./pglite";

let pg: PGlite;

beforeAll(async () => {
  const test = await createTestDatabase();
  pg = test.pg;
  expect(await applyMigrations(test.db)).toEqual(migrationFiles());
  await applySeeds(test.db);
  // Idempotent: a second run applies nothing new and duplicates nothing.
  expect(await applyMigrations(test.db)).toEqual([]);
  await applySeeds(test.db);
  await pg.exec("insert into days (day) values (1)");
});

async function count(table: string): Promise<number> {
  const { rows } = await pg.query<{ n: number }>(`select count(*)::int as n from ${table}`);
  return rows[0].n;
}

describe("migrations and seeds", () => {
  it("seeds figures, planets, blocked words and the single sky_state row", async () => {
    expect(await count("figures")).toBe(readFigures().length);
    expect(await count("planets")).toBe(8);
    expect(await count("blocked_words")).toBeGreaterThan(30);
    expect(await count("sky_state")).toBe(1);
  });

  it("stores planets with the thresholds from the design document", async () => {
    const { rows } = await pg.query<{ name: string; threshold: number }>(
      "select name, threshold from planets order by id",
    );
    expect(rows.map((r) => [r.name, r.threshold])).toEqual([
      ["Mercurio", 1000],
      ["Venus", 2500],
      ["Tierra", 5000],
      ["Marte", 10000],
      ["Júpiter", 26400],
      ["Saturno", 100000],
      ["Urano", 300000],
      ["Neptuno", 1000000],
    ]);
  });

  it("rejects usernames that are not normalized", async () => {
    for (const bad of ["Luna", "@luna", "lu na"]) {
      await expect(
        pg.query("insert into stars (username, born_day, last_day) values ($1, 1, 1)", [bad]),
      ).rejects.toThrow();
    }
  });

  it("computes star levels from distinct days", async () => {
    const { rows } = await pg.query<{ l: number[] }>(
      "select array_agg(star_level(d) order by d) as l from unnest(array[1,2,3,7,14,15,30,99,100,365,400]) d",
    );
    expect(rows[0].l).toEqual([0, 0, 1, 2, 2, 3, 4, 4, 5, 6, 6]);
  });
});

describe("figures", () => {
  const figures = readFigures();

  it("has at least 14 handmade figures with unique slugs", () => {
    expect(figures.length).toBeGreaterThanOrEqual(14);
    expect(new Set(figures.map((f) => f.slug)).size).toBe(figures.length);
    expect(figures.every((f) => f.handmade)).toBe(true);
  });

  it.each(figures.map((f) => [f.slug, f] as const))("%s is a valid connected drawing", (_, f) => {
    expect(f.anchors.length).toBeGreaterThanOrEqual(8);
    for (const [x, y] of f.anchors) {
      expect(Math.abs(x)).toBeLessThanOrEqual(1);
      expect(Math.abs(y)).toBeLessThanOrEqual(1);
    }
    const seen = new Set<string>();
    for (const [a, b] of f.edges) {
      expect(a).not.toBe(b);
      expect(f.anchors[a]).toBeDefined();
      expect(f.anchors[b]).toBeDefined();
      const key = [Math.min(a, b), Math.max(a, b)].join("-");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    // Every anchor is reachable from anchor 0.
    const reached = new Set([0]);
    for (let grew = true; grew;) {
      grew = false;
      for (const [a, b] of f.edges) {
        if (reached.has(a) !== reached.has(b)) {
          reached.add(a).add(b);
          grew = true;
        }
      }
    }
    expect(reached.size).toBe(f.anchors.length);
  });
});

describe("public access (anon role)", () => {
  const privateTables = [
    "figures",
    "constellations",
    "slots",
    "stars",
    "participations",
    "comment_inbox",
    "pending_invites",
    "shooting_stars",
    "unlocks",
    "planets",
    "blocked_words",
  ];

  it.each(privateTables)("cannot read %s", async (table) => {
    await expect(asRole(pg, "anon", () => pg.query(`select * from ${table}`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("cannot write anywhere", async () => {
    const writes = [
      "insert into stars (username, born_day, last_day) values ('intruso', 1, 1)",
      "insert into blocked_words (word) values ('x')",
      "update sky_state set total_stars = 999",
      "insert into days (day) values (99)",
      "delete from days",
    ];
    for (const sql of writes) {
      await expect(asRole(pg, "anon", () => pg.query(sql))).rejects.toThrow(/permission denied/);
    }
  });

  it("can read sky_state and the public columns of days", async () => {
    const state = await asRole(pg, "anon", () => pg.query("select total_stars from sky_state"));
    expect(state.rows).toHaveLength(1);
    const days = await asRole(pg, "anon", () =>
      pg.query("select day, challenge_type, shooting_count, closed from days"),
    );
    expect(days.rows.length).toBeGreaterThan(0);
  });

  it("cannot read the private columns of days", async () => {
    await expect(
      asRole(pg, "anon", () => pg.query("select ig_media_id from days")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("search_stars", () => {
  beforeAll(async () => {
    await pg.exec(`
      insert into stars (username, born_day, last_day, days_count, status) values
        ('luna', 1, 1, 7, 'active'),
        ('luna_cr', 1, 1, 1, 'active'),
        ('lunar', 1, 1, 1, 'active'),
        ('mi.luna', 1, 1, 1, 'active'),
        ('lunamala', 1, 1, 1, 'review'),
        ('lunaoculta', 1, 1, 1, 'hidden'),
        ('a.b', 1, 1, 1, 'active'),
        ('a_b', 1, 1, 1, 'active');
      insert into stars (username, born_day, last_day)
        select 'estrella' || g, 1, 1 from generate_series(1, 20) g;
    `);
  });

  const search = (q: string) =>
    asRole(pg, "anon", () =>
      pg.query<{ username: string; level: number }>("select * from search_stars($1)", [q]),
    ).then((r) => r.rows);

  it("normalizes the query and puts prefix matches first, exact match on top", async () => {
    const rows = await search(" @Luna ");
    expect(rows.slice(0, 3).map((r) => r.username)).toEqual(["luna", "lunar", "luna_cr"]);
    expect(rows[0].level).toBe(2);
    expect(rows.map((r) => r.username)).toContain("mi.luna");
  });

  it("never returns stars in review or hidden", async () => {
    expect((await search("lunamala")).map((r) => r.username)).not.toContain("lunamala");
    expect((await search("lunaoculta")).map((r) => r.username)).not.toContain("lunaoculta");
  });

  it("returns at most 8 results", async () => {
    expect(await search("estrella")).toHaveLength(8);
  });

  it("treats _ and % literally", async () => {
    expect((await search("a_"))[0].username).toBe("a_b");
    expect(await search("%")).toEqual([]);
  });

  it("returns nothing for an empty query", async () => {
    expect(await search("  @ ")).toEqual([]);
  });
});
