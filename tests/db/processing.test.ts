import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, applySeeds } from "../../scripts/db/runner";
import { toInboxRows, type IncomingComment } from "@/server/import";
import { processInbox, type ProcessingStore, type StoredFigure } from "@/server/processing";
import { createTestDatabase } from "./pglite";

let pg: PGlite;
let store: ProcessingStore;

beforeEach(async () => {
  const test = await createTestDatabase();
  pg = test.pg;
  await applyMigrations(test.db);
  await applySeeds(test.db);
  store = pglStore(pg);
});

// Same contract as supabaseStore(), straight to SQL.
function pglStore(db: PGlite): ProcessingStore {
  const one = async <T>(sql: string, params: unknown[] = []) =>
    (await db.query<T>(sql, params)).rows[0];
  return {
    async processBatch(limit) {
      return (await one<{ r: object }>("select process_inbox($1) as r", [limit])).r;
    },
    async countUnfinishedConstellations() {
      return (
        await one<{ n: number }>(
          "select count(*)::int as n from constellations where status <> 'complete'",
        )
      ).n;
    },
    async lastConstellationId() {
      return (await one<{ id: number }>("select coalesce(max(id), 0) as id from constellations"))
        .id;
    },
    async loadFigures() {
      return (
        await db.query<StoredFigure>(
          "select id, slug, name, anchors, edges, handmade from figures order by id",
        )
      ).rows;
    },
    async openConstellation(a) {
      await db.query("select open_constellation($1, $2, $3, $4, $5, $6, $7, $8::jsonb)", [
        a.p_id,
        a.p_figure_id,
        a.p_name,
        a.p_center_x,
        a.p_center_y,
        a.p_scale,
        a.p_rotation,
        JSON.stringify(a.p_slots),
      ]);
    },
  };
}

let clock = Date.parse("2026-11-01T12:00:00Z");

async function addComments(day: number, comments: (string | IncomingComment)[]) {
  await pg.query("insert into days (day) values ($1) on conflict do nothing", [day]);
  const list = comments.map((c) => (typeof c === "string" ? { username: c } : c));
  const { rows } = toInboxRows(day, list, new Date(clock));
  clock += 60_000;
  for (const r of rows) {
    await pg.query(
      `insert into comment_inbox (ig_comment_id, day, username, mentions, commented_at, source)
       values ($1, $2, $3, $4, $5, $6) on conflict do nothing`,
      [r.ig_comment_id, r.day, r.username, r.mentions, r.commented_at, r.source],
    );
  }
}

const people = (n: number, prefix = "p") =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

async function rows<T>(sql: string, params: unknown[] = []) {
  return (await pg.query<T>(sql, params)).rows;
}

async function counts() {
  return (
    await rows<Record<string, number>>(`select
      (select count(*)::int from stars) as stars,
      (select count(*)::int from participations) as participations,
      (select coalesce(sum(days_count), 0)::int from stars) as days,
      (select count(*)::int from stars where invited_by is not null) as invited,
      (select count(*)::int from constellations where status = 'complete') as complete,
      (select total_stars from sky_state) as total_stars`)
  )[0];
}

describe("process_inbox", () => {
  it("301 new people fill one constellation and start the next", async () => {
    await addComments(1, people(301));
    const summary = await processInbox(store);
    expect(summary).toMatchObject({
      processed: 301,
      newStars: 301,
      constellationsCompleted: 1,
      pending: 0,
    });

    const constellations = await rows<{
      id: number;
      status: string;
      star_count: number;
      started_day: number;
      completed_day: number;
    }>("select id, status, star_count, started_day, completed_day from constellations order by id");
    expect(constellations[0]).toMatchObject({
      id: 1,
      status: "complete",
      star_count: 300,
      started_day: 1,
      completed_day: 1,
    });
    expect(constellations[1]).toMatchObject({
      id: 2,
      status: "forming",
      star_count: 1,
      started_day: 1,
    });

    const state = (
      await rows<{
        total_stars: number;
        total_constellations: number;
        current_day: number;
        stage: number;
      }>("select total_stars, total_constellations, current_day, stage from sky_state")
    )[0];
    expect(state).toEqual({ total_stars: 301, total_constellations: 1, current_day: 1, stage: 1 });

    // Stars take their slot positions, in order of arrival.
    const mismatched = await rows(
      `select 1 from stars s join slots sl on sl.constellation_id = s.constellation_id and sl.slot_index = s.slot_index
       where sl.x <> s.x or sl.y <> s.y`,
    );
    expect(mismatched).toHaveLength(0);
    const last = (
      await rows<{ constellation_id: number; slot_index: number }>(
        "select constellation_id, slot_index from stars where username = 'p301'",
      )
    )[0];
    expect(last).toEqual({ constellation_id: 2, slot_index: 0 });
  });

  it("opens the next constellation when exactly 300 people complete one", async () => {
    await addComments(1, people(300));
    await processInbox(store);
    expect(await rows("select id, status, star_count from constellations order by id")).toEqual([
      { id: 1, status: "complete", star_count: 300 },
      { id: 2, status: "forming", star_count: 0 },
    ]);
  });

  it("gives the same result in small batches", async () => {
    await addComments(1, people(301));
    const summary = await processInbox(store, 50);
    expect(summary.batches).toBeGreaterThan(5);
    expect(await counts()).toMatchObject({ stars: 301, complete: 1, total_stars: 301 });
  });

  it("never duplicates anything when run again", async () => {
    await addComments(1, ["ana", { username: "leo", text: "hola @pau" }, "ana"]);
    await addComments(2, ["ana", "pau"]);
    await processInbox(store);
    const before = await counts();

    // Same list again, a second run, and even a forced re-run of every comment.
    await addComments(2, ["ana", "pau"]);
    await processInbox(store);
    await pg.exec("update comment_inbox set processed = false");
    await processInbox(store);

    expect(await counts()).toEqual(before);
    expect(before).toMatchObject({ stars: 3, participations: 4, days: 4, invited: 1 });
  });

  it("counts one participation per person per day, whatever the number of comments", async () => {
    await addComments(1, [
      "ana",
      { username: "ana", text: "otra vez" },
      { username: "@ANA", text: "y otra" },
    ]);
    await addComments(3, ["ana"]);
    await processInbox(store);
    const star = (
      await rows<{ days_count: number; born_day: number; last_day: number }>(
        "select days_count, born_day, last_day from stars where username = 'ana'",
      )
    )[0];
    expect(star).toEqual({ days_count: 2, born_day: 1, last_day: 3 });
  });

  it("gives the invitation to the first person who mentioned the newcomer", async () => {
    await addComments(1, [
      { username: "ana", text: "ven @leo" },
      { username: "pau", text: "@leo mira esto" },
    ]);
    await processInbox(store);
    await addComments(2, ["leo"]);
    await processInbox(store);

    const leo = (
      await rows<{ inviter: string }>(
        "select i.username as inviter from stars s join stars i on i.id = s.invited_by where s.username = 'leo'",
      )
    )[0];
    expect(leo.inviter).toBe("ana");
    const ana = (
      await rows<{ invited_count: number }>(
        "select invited_count from stars where username = 'ana'",
      )
    )[0];
    expect(ana.invited_count).toBe(1);
    expect(await rows("select * from pending_invites")).toHaveLength(0);
  });

  it("decides invitations inside one batch by comment order", async () => {
    // ana mentions leo before leo's first comment: invitation.
    // mia comments first, then pau mentions her: no invitation.
    await addComments(1, [{ username: "ana", text: "@leo" }]);
    await addComments(1, ["leo", "mia"]);
    await addComments(1, [{ username: "pau", text: "@mia @ana" }]);
    await processInbox(store);

    const invited = await rows<{ username: string; inviter: string }>(
      "select s.username, i.username as inviter from stars s join stars i on i.id = s.invited_by",
    );
    expect(invited).toEqual([{ username: "leo", inviter: "ana" }]);
  });

  it("never counts a mention of someone who already has a star, or of oneself", async () => {
    await addComments(1, ["leo"]);
    await processInbox(store);
    await addComments(2, [{ username: "ana", text: "@leo @ana" }]);
    await processInbox(store);
    expect((await counts()).invited).toBe(0);
    expect(await rows("select * from pending_invites")).toHaveLength(0);
  });

  it("keeps a pending invitation for someone who has not commented yet", async () => {
    await addComments(1, [{ username: "ana", text: "@futura" }]);
    await processInbox(store);
    expect(await rows("select invited_username from pending_invites")).toEqual([
      { invited_username: "futura" },
    ]);
  });

  it("sends usernames with blocked words to review, still in their slot", async () => {
    await addComments(1, ["ana", "elputo_99", "p.u.t.o"]);
    const summary = await processInbox(store);
    expect(summary.reviewStars).toBe(2);
    const review = await rows<{ username: string; slot_index: number }>(
      "select username, slot_index from stars where status = 'review' order by username",
    );
    expect(review.map((r) => r.username)).toEqual(["elputo_99", "p.u.t.o"]);
    expect(review.every((r) => r.slot_index !== null)).toBe(true);
    expect(await rows("select * from search_stars('elputo')")).toHaveLength(0);
  });

  it("unlocks a planet on the day its star is born and moves to the next stage", async () => {
    await addComments(1, people(600));
    await addComments(2, people(500, "q"));
    await processInbox(store);
    const mercury = (
      await rows<{ unlocked_day: number }>(
        "select unlocked_day from planets where name = 'Mercurio'",
      )
    )[0];
    expect(mercury.unlocked_day).toBe(2);
    const venus = (
      await rows<{ unlocked_day: number | null }>(
        "select unlocked_day from planets where name = 'Venus'",
      )
    )[0];
    expect(venus.unlocked_day).toBeNull();
    const states = await rows<{ status: string; n: number }>(
      "select status, count(*)::int as n from constellations group by status order by status",
    );
    expect(states).toEqual([
      { status: "complete", n: 3 },
      { status: "forming", n: 1 },
    ]);
  });

  it("marks touched constellations as changed for the public files", async () => {
    await addComments(1, people(10));
    await processInbox(store);
    await pg.exec("update constellations set dirty = false");
    await addComments(2, ["p3"]);
    await processInbox(store);
    expect(await rows("select id from constellations where dirty")).toEqual([{ id: 1 }]);
  });

  it("opens the first constellation even before any comment", async () => {
    const summary = await processInbox(store);
    expect(summary.constellationsOpened).toBe(1);
    expect(await rows("select id, status from constellations")).toEqual([
      { id: 1, status: "forming" },
    ]);
    expect((await rows<{ n: number }>("select count(*)::int as n from slots"))[0].n).toBe(300);
  });
});

describe("toInboxRows", () => {
  it("normalizes names, keeps mentions only, and drops invalid usernames", () => {
    const { rows: list, invalid } = toInboxRows(4, [
      { username: "@Ana", text: "hola @Leo y @leo" },
      { username: "no válido" },
    ]);
    expect(invalid).toEqual(["no válido"]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ day: 4, username: "ana", mentions: ["leo"], source: "manual" });
    expect(list[0]).not.toHaveProperty("text");
  });

  it("gives the same id to the same comment, so imports are idempotent", () => {
    const a = toInboxRows(1, [{ username: "ana", text: "x" }]).rows[0];
    const b = toInboxRows(1, [{ username: "ANA", text: "x" }], new Date(0)).rows[0];
    expect(a.ig_comment_id).toBe(b.ig_comment_id);
    expect(toInboxRows(2, [{ username: "ana", text: "x" }]).rows[0].ig_comment_id).not.toBe(
      a.ig_comment_id,
    );
  });
});
