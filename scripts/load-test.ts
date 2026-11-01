// Load test (phase 12): a local copy of the database (Postgres 17, like Supabase) with 3,000,000
// fake stars, to measure search, processing and file generation with the real code. The REST
// calls of supabase-js are answered by scripts/load-test/rest-adapter.ts instead of PostgREST.
// Nothing here touches the real Supabase project.
//
//   npm run load-test -- --setup     creates .cache/load-db and loads the fake sky (~10 min)
//   npm run load-test -- --measure   runs the measurements and writes scripts/output/load-test.json
//   npm run load-test -- --migrate   applies new migrations to the local copy
//   npm run load-test -- --remove    deletes the local database
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { importComments, type IncomingComment } from "../src/server/import";
import {
  ensureCapacity,
  processInbox,
  supabaseStore,
  type ProcessingStore,
  type StoredFigure,
} from "../src/server/processing";
import { publishSky } from "../src/server/publish/publish";
import type { PublicStorage } from "../src/server/storage";
import { applyMigrations, applySeeds, type SqlRunner } from "./db/runner";
import { createRestFetch } from "./load-test/rest-adapter";

const { values: args } = parseArgs({
  options: {
    setup: { type: "boolean", default: false },
    measure: { type: "boolean", default: false },
    remove: { type: "boolean", default: false },
    migrate: { type: "boolean", default: false },
    stars: { type: "string", default: "3000000" },
    only: { type: "string" },
    comments: { type: "string", default: "50000" },
  },
});

const ROOT = resolve(".cache");
const DB_DIR = join(ROOT, "load-db");
const FILES_DIR = join(ROOT, "load-files");
const PG_PORT = 54329;
const PASSWORD = "local-load-test";
const DAYS = 300;
const STARS = Number(args.stars);

const postgres = new EmbeddedPostgres({
  databaseDir: DB_DIR,
  port: PG_PORT,
  user: "postgres",
  password: PASSWORD,
  persistent: true,
  // UTF-8 like Supabase (the Windows default would be the system code page).
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
});

const log = (message: string) =>
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);

async function timed<T>(label: string, work: () => Promise<T>): Promise<{ ms: number; result: T }> {
  const start = performance.now();
  const result = await work();
  const ms = Math.round(performance.now() - start);
  log(`${label}: ${(ms / 1000).toFixed(1)} s`);
  return { ms, result };
}

function runner(client: pg.Client): SqlRunner {
  return {
    async exec(sql) {
      await client.query(sql);
    },
    async query(sql, params) {
      return (await client.query(sql, params)).rows;
    },
  };
}

/** The same database operations as supabaseStore, straight over SQL (for the bulk setup). */
function pgStore(client: pg.Client): ProcessingStore {
  const one = async <T>(sql: string, params: unknown[] = []) =>
    (await client.query(sql, params)).rows[0] as T;
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
        await client.query(
          "select id, slug, name, anchors, edges, handmade from figures order by id",
        )
      ).rows as StoredFigure[];
    },
    async openConstellation(a) {
      await client.query("select open_constellation($1, $2, $3, $4, $5, $6, $7, $8::jsonb)", [
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

// ---------------------------------------------------------------- setup

async function setup() {
  if (existsSync(DB_DIR)) throw new Error(`${DB_DIR} already exists: use --remove first.`);
  mkdirSync(ROOT, { recursive: true });
  await postgres.initialise();
  await postgres.start();
  const client = postgres.getPgClient();
  await client.connect();
  try {
    // The roles Supabase has, with its default grants (as in tests/db/pglite.ts).
    await client.query(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create role authenticator login noinherit password '${PASSWORD}';
      grant anon, authenticated, service_role to authenticator;
      grant usage on schema public to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
      -- Supabase's limits for API calls.
      alter role anon set statement_timeout = '3s';
      alter role authenticated set statement_timeout = '8s';
    `);
    const db = runner(client);
    await applyMigrations(db);
    await applySeeds(db);
    await client.query("grant usage on schema extensions to anon, authenticated, service_role");

    const constellations = Math.ceil(STARS / 300);
    await timed(`open ${constellations} constellations (slots from the sky engine)`, () =>
      ensureCapacity(pgStore(client), STARS),
    );

    // Days: the video at 18:00 UTC.
    await client.query(`
      insert into days (day, published_at, closed)
      select d, timestamptz '2026-11-01 18:00+00' + (d - 1) * interval '1 day', true
      from generate_series(1, ${DAYS}) d
      on conflict (day) do nothing`);

    // Stars fill the slots in order. The sky grows faster over time: the stars up to day d are
    // proportional to d², so constellation n fills around day 300·√(n / total).
    await timed(`load ${STARS.toLocaleString()} stars`, () =>
      client.query(`
        create temporary table syl as
          select array['ma','ri','so','la','ne','to','va','ca','lu','pe','an','el','ju','da','mi',
                       'ko','sa','ti','zo','be','ra','fe','go','ni','ol','us','ka','ya','re','di'] as a;
        insert into stars (id, username, constellation_id, slot_index, x, y, born_day, days_count, last_day)
        select n, username, constellation_id, slot_index, x, y, born,
               least(days, ${DAYS} - born + 1), born + least(days, ${DAYS} - born + 1) - 1
        from (
          select row_number() over (order by s.constellation_id, s.slot_index) as n,
                 s.constellation_id, s.slot_index, s.x, s.y,
                 least(${DAYS}, 1 + floor(${DAYS} * sqrt(s.constellation_id::float8 / ${constellations}))::int) as born,
                 1 + floor(-ln(1 - random()) * 2.2)::int as days,
                 (select a[1 + (h % 30)] || a[1 + ((h / 30) % 30)] || a[1 + ((h / 900) % 30)] from syl)
                   || (array['', '_', '.'])[1 + ((h / 27000) % 3)]
                   || (row_number() over (order by s.constellation_id, s.slot_index))::text as username
          from slots s, lateral (select abs(hashtext(s.constellation_id || ':' || s.slot_index)) as h) hh
          where s.constellation_id <= ${constellations}
        ) t
        where n <= ${STARS}`),
    );
    await client.query("select setval('stars_id_seq', (select max(id) from stars))");

    await timed("invitations (15% of stars were invited)", () =>
      client.query(`
        update stars set invited_by = greatest(1, id - 1 - floor(random() * id * 0.5)::bigint)
        where id > 1 and random() < 0.15;
        update stars s set invited_count = c.n
        from (select invited_by, count(*) as n from stars where invited_by is not null group by invited_by) c
        where s.id = c.invited_by`),
    );

    await timed("participations (one per star and day)", () =>
      client.query(`
        insert into participations (star_id, day, first_at)
        select s.id, s.born_day + g, d.published_at + random() * interval '20 hours'
        from stars s
        cross join lateral generate_series(0, s.days_count - 1) g
        join days d on d.day = s.born_day + g`),
    );

    await timed("constellations, planets and totals", () =>
      client.query(`
        update constellations c set status = 'complete', star_count = 300, completed_day = t.day, dirty = true
        from (select constellation_id, max(born_day) as day, count(*) as n from stars group by constellation_id) t
        where c.id = t.constellation_id and t.n = 300;
        update constellations c set status = 'forming', star_count = t.n, dirty = true
        from (select constellation_id, count(*) as n from stars group by constellation_id) t
        where c.id = t.constellation_id and t.n < 300;
        update planets p set unlocked_day = (
          select min(born_day) from stars where id = p.threshold
        ) where p.threshold <= ${STARS};
        update sky_state set current_day = ${DAYS},
          total_stars = (select count(*) from stars),
          total_constellations = (select count(*) from constellations where status = 'complete'),
          stage = 3;
        update comment_inbox set processed = true;`),
    );
    await ensureCapacity(pgStore(client), 0);
    await timed("vacuum analyze", () => client.query("vacuum analyze"));

    const size = await client.query(`
      select relname as table, pg_size_pretty(pg_total_relation_size(c.oid)) as size,
             pg_total_relation_size(c.oid) as bytes
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by bytes desc limit 8`);
    const total = await client.query(
      "select pg_size_pretty(pg_database_size(current_database())) as size",
    );
    console.table(size.rows.map(({ table, size }) => ({ table, size })));
    log(`database size: ${total.rows[0].size}`);
  } finally {
    await client.end();
    await postgres.stop();
  }
}

// ---------------------------------------------------------------- measurements

/** A Supabase client whose REST calls run on the local database under the given role. */
function localClient(pool: pg.Pool, role: string): SupabaseClient {
  return createClient("http://local.invalid", "local", {
    auth: { persistSession: false },
    global: { fetch: createRestFetch(pool, { role }) },
  });
}

/** Writes the public files to disk instead of Supabase Storage. */
function diskStorage(): PublicStorage {
  return {
    async ensureReady() {
      await mkdir(FILES_DIR, { recursive: true });
    },
    async put(path, body) {
      const file = join(FILES_DIR, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, body);
    },
    async list() {
      return [];
    },
    async remove() {},
    publicUrl: (path) => `/load-files/${path}`,
  };
}

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

async function measure() {
  if (!existsSync(DB_DIR)) throw new Error("Run --setup first.");
  await postgres.start();
  const client = postgres.getPgClient();
  await client.connect();
  const pool = new pg.Pool({
    host: "127.0.0.1",
    port: PG_PORT,
    user: "postgres",
    password: PASSWORD,
    database: "postgres",
    max: 10,
  });
  const report: Record<string, unknown> = {};
  try {
    const service = localClient(pool, "service_role");
    const totals = (await client.query("select total_stars, total_constellations from sky_state"))
      .rows[0];
    report.sky = totals;
    report.databaseSize = (
      await client.query("select pg_size_pretty(pg_database_size(current_database())) as s")
    ).rows[0].s;
    log(`sky: ${totals.total_stars} stars, ${totals.total_constellations} constellations`);

    // 1. Search, as the public page does it (anon key through PostgREST).
    const sample = (
      await client.query<{ username: string }>(
        "select username from stars tablesample system (0.05) where status = 'active' limit 60",
      )
    ).rows.map((r) => r.username);
    const queries = sample.flatMap((name, i) => {
      const typo = name.length > 4 ? name.slice(0, 2) + name[3] + name[2] + name.slice(4) : name;
      return [
        { kind: "prefijo corto (3)", q: name.slice(0, 3) },
        { kind: "prefijo (4-6)", q: name.slice(0, 4 + (i % 3)) },
        { kind: "nombre completo", q: name },
        { kind: "con un error", q: typo },
      ];
    });
    // As the public role, with Supabase's 3 s limit for it. Time measured at the database
    // connection; on the real site add the network round trip (see docs/rendimiento.md).
    const search = await pool.connect();
    const times: number[] = [];
    const byKind: Record<string, number[]> = {};
    const empty: string[] = [];
    try {
      await search.query("set role anon");
      await search.query("set statement_timeout = '3s'");
      await search.query("select * from search_stars('warm')");
      for (const { kind, q } of queries) {
        const start = performance.now();
        const { rows } = await search.query("select * from search_stars($1)", [q]);
        const ms = performance.now() - start;
        times.push(ms);
        (byKind[kind] ??= []).push(ms);
        if (!rows.length) empty.push(q);
      }
    } finally {
      await search.query("reset role; reset statement_timeout").catch(() => {});
      search.release();
    }
    const serverPlan = await client.query(
      "explain (analyze, format json) select * from search_stars($1)",
      [queries[2].q],
    );
    report.search = {
      queries: queries.length,
      p50: Math.round(percentile(times, 50)),
      p95: Math.round(percentile(times, 95)),
      max: Math.round(Math.max(...times)),
      withoutResults: empty.length,
      byKind: Object.fromEntries(
        Object.entries(byKind).map(([kind, list]) => [
          kind,
          { p50: Math.round(percentile(list, 50)), p95: Math.round(percentile(list, 95)) },
        ]),
      ),
      exampleServerMs: Math.round(serverPlan.rows[0]["QUERY PLAN"][0]["Execution Time"]),
    };
    log(`search: ${JSON.stringify(report.search)}`);
    if (args.only === "search") return;

    // 2. A full publish of every file (the worst case: the first publish, or a rebuild).
    const full = await timed("full publish (every constellation)", () =>
      publishSky(service, diskStorage()),
    );
    report.fullPublish = { ms: full.ms, ...full.result };

    // 3. A heavy day: 50,000 comments (60% people who already have a star, 40% new, 10% invite).
    const comments = Number(args.comments);
    const day = DAYS + 1;
    await client.query(
      "insert into days (day, published_at) values ($1, timestamptz '2026-11-01 18:00+00' + ($1 - 1) * interval '1 day') on conflict do nothing",
      [day],
    );
    const returning = (
      await client.query<{ username: string }>(
        `select username from stars tablesample system (2) limit ${Math.round(comments * 0.6)}`,
      )
    ).rows.map((r) => r.username);
    const fresh = Array.from(
      { length: comments - returning.length },
      (_, i) => `nueva_${day}_${i}`,
    );
    const list: IncomingComment[] = [...returning, ...fresh].map((username, i) => ({
      username,
      text: i % 10 === 0 ? `vengan @${fresh[(i * 7) % fresh.length]}` : "aquí estoy",
    }));
    const imported = await timed(`import ${comments.toLocaleString()} comments`, () =>
      importComments(service, day, list),
    );
    report.import = {
      ms: imported.ms,
      ...imported.result,
      invalid: imported.result.invalid.length,
    };

    const batchTimes: number[] = [];
    const store = supabaseStore(service);
    const timedStore: ProcessingStore = {
      ...store,
      async processBatch(limit) {
        const start = performance.now();
        const result = await store.processBatch(limit);
        batchTimes.push(Math.round(performance.now() - start));
        return result;
      },
    };
    await client.query("update sky_state set current_day = $1", [day]);
    const processed = await timed("process the day", () => processInbox(timedStore));
    report.process = {
      ms: processed.ms,
      ...processed.result,
      slowestBatchMs: Math.max(...batchTimes),
      batchMs: batchTimes,
    };

    const daily = await timed("publish the day", () => publishSky(service, diskStorage()));
    report.dailyPublish = { ms: daily.ms, ...daily.result };

    const size = await client.query(
      "select pg_size_pretty(pg_database_size(current_database())) as s",
    );
    report.databaseSizeAfter = size.rows[0].s;
  } finally {
    await pool.end();
    await client.end();
    await postgres.stop();
  }
  mkdirSync("scripts/output", { recursive: true });
  writeFileSync("scripts/output/load-test.json", JSON.stringify(report, null, 2));
  log("written scripts/output/load-test.json");
}

if (args.remove) {
  rmSync(DB_DIR, { recursive: true, force: true });
  rmSync(FILES_DIR, { recursive: true, force: true });
  log("local load-test database removed");
} else if (args.migrate) {
  // Applies new migrations to the local copy (to measure a change without reloading).
  await postgres.start();
  const client = postgres.getPgClient();
  await client.connect();
  try {
    log(`migrations applied: ${(await applyMigrations(runner(client))).join(", ") || "none"}`);
  } finally {
    await client.end();
    await postgres.stop();
  }
} else if (args.setup) {
  await setup();
} else if (args.measure) {
  await measure();
} else {
  console.log("Usage: npm run load-test -- --setup | --measure | --remove");
}
