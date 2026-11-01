// Simulates N days of the challenge with fake comments, processes them through the real
// pipeline (process_inbox on Supabase) and checks that every total adds up.
//
// Usage: npm run fake-data -- --days 31 --people 30000 [--reset] [--seed 1]
//
// Every fake username starts with "prueba_". The script refuses to run if the database holds
// any star that is not fake, and --reset only ever deletes fake data.
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { createRng } from "../src/sky/random";
import { BATCH_SIZE, processInbox, supabaseStore } from "../src/server/processing";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const { values: args } = parseArgs({
  options: {
    days: { type: "string", default: "31" },
    people: { type: "string", default: "30000" },
    seed: { type: "string", default: "1" },
    batch: { type: "string", default: String(BATCH_SIZE) },
    reset: { type: "boolean", default: false },
  },
});
const DAYS = Number(args.days);
const PEOPLE = Number(args.people);
const BATCH = Number(args.batch);
const PREFIX = "prueba_";

const { SUPABASE_DB_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_DB_URL || !NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Faltan SUPABASE_DB_URL, NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local",
  );
  process.exit(1);
}

interface FakeComment {
  id: string;
  day: number;
  username: string;
  mentions: string[];
  at: string;
}

// ---------------------------------------------------------------- simulation

function simulate(): FakeComment[][] {
  const rng = createRng(Number(args.seed), "fake-data");
  const syllables = [
    "lu",
    "na",
    "so",
    "fi",
    "da",
    "ni",
    "va",
    "le",
    "ma",
    "ri",
    "jo",
    "se",
    "pa",
    "ca",
    "mi",
    "to",
    "ra",
    "fa",
    "ke",
    "vin",
    "sol",
    "mar",
    "rey",
    "cr",
  ];
  const used = new Set<string>();
  const name = () => {
    for (;;) {
      const parts = Array.from(
        { length: 2 + rng.int(2) },
        () => syllables[rng.int(syllables.length)],
      );
      const sep = ["", "_", "."][rng.int(3)];
      const candidate = `${PREFIX}${parts.join("")}${sep}${rng.int(10000)}`;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
  };

  // New people per day grow linearly (day N brings ~8x day 1).
  const weights = Array.from({ length: DAYS }, (_, d) => 1 + (7 * d) / Math.max(DAYS - 1, 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const joiners = weights.map((w) => Math.floor((PEOPLE * w) / totalWeight));
  joiners[DAYS - 1] += PEOPLE - joiners.reduce((a, b) => a + b, 0);

  const everyone: { name: string; engagement: number }[] = [];
  const days: FakeComment[][] = [];

  for (let d = 1; d <= DAYS; d++) {
    const base = Date.parse("2026-11-01T14:00:00Z") + (d - 1) * 86_400_000;
    const returning = everyone.filter((p) => rng.next() < p.engagement).map((p) => p.name);
    const fresh = Array.from({ length: joiners[d - 1] }, () => {
      const person = { name: name(), engagement: 0.7 * rng.next() ** 1.5 };
      everyone.push(person);
      return person.name;
    });

    type Draft = { username: string; mentions: string[] };
    const invites: Draft[] = [];
    const regular: Draft[] = [];

    // Some newcomers were tagged earlier that day by people who came back, some of them
    // by very active inviters (skewed choice), so rings and big counts show up.
    if (returning.length) {
      for (const newcomer of fresh) {
        if (rng.next() < 0.35) {
          const inviter = returning[Math.floor(returning.length * rng.next() ** 3)];
          invites.push({ username: inviter, mentions: [newcomer] });
        }
      }
    }
    for (const username of rng.shuffle([...returning, ...fresh])) {
      const mentions: string[] = [];
      if (rng.next() < 0.08 && everyone.length > 1)
        mentions.push(everyone[rng.int(everyone.length)].name);
      if (rng.next() < 0.01) mentions.push(`${PREFIX}fantasma${rng.int(100000)}`);
      regular.push({ username, mentions: mentions.filter((m) => m !== username) });
    }
    // A few people comment twice.
    const repeats = regular
      .filter(() => rng.next() < 0.08)
      .map((c) => ({ username: c.username, mentions: [] }));

    days.push(
      [...invites, ...regular, ...repeats].map((c, i) => ({
        id: `fake:${d}:${i}`,
        day: d,
        username: c.username,
        mentions: c.mentions,
        at: new Date(base + i * 100).toISOString(),
      })),
    );
  }
  return days;
}

// Replays the rules in comment order to know what the database must contain.
function expected(days: FakeComment[][]) {
  const starred = new Set<string>();
  const participations = new Set<string>();
  const pending = new Map<string, string>();
  const invitedBy = new Map<string, string>();
  for (const comment of days.flat()) {
    if (!starred.has(comment.username)) {
      starred.add(comment.username);
      const inviter = pending.get(comment.username);
      if (inviter) invitedBy.set(comment.username, inviter);
      pending.delete(comment.username);
    }
    participations.add(`${comment.username}|${comment.day}`);
    for (const m of comment.mentions) {
      if (m !== comment.username && !starred.has(m) && !pending.has(m))
        pending.set(m, comment.username);
    }
  }
  const invitedCount = new Map<string, number>();
  for (const inviter of invitedBy.values())
    invitedCount.set(inviter, (invitedCount.get(inviter) ?? 0) + 1);
  return {
    stars: starred.size,
    participations: participations.size,
    invitedBy,
    invitedCount,
    pending: pending.size,
  };
}

// ---------------------------------------------------------------- database

const db = new pg.Client({ connectionString: SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query(sql, params)).rows as T[];
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await q<T>(sql, params))[0];

try {
  const real = await one<{ n: number }>(
    "select count(*)::int as n from stars where username not like 'prueba\\_%'",
  );
  if (real.n > 0) {
    console.error(
      `Hay ${real.n} estrellas reales en la base. Este script solo trabaja con datos de prueba.`,
    );
    process.exit(1);
  }
  const existingDays = await one<{ n: number }>("select count(*)::int as n from days");
  if (existingDays.n > 0 && !args.reset) {
    console.error(
      "La base ya tiene días. Usa --reset para borrar los datos de prueba y empezar de cero.",
    );
    process.exit(1);
  }
  if (args.reset) {
    await db.query(`
      update planets set unlocked_day = null where true;
      truncate comment_inbox, pending_invites, participations, shooting_stars, unlocks,
               stars, slots, constellations restart identity;
      delete from days where true;
      update sky_state set current_day = null, total_stars = 0, total_constellations = 0,
                           stage = 1, index_version = 0 where id;
    `);
    console.log("Datos de prueba borrados.");
  }

  const days = simulate();
  const store = supabaseStore(
    createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    }),
  );

  console.log(`Simulando ${DAYS} días, ${PEOPLE} personas, ${days.flat().length} comentarios.\n`);
  console.log("día  comentarios  nuevas  invitaciones  constelaciones  segundos");
  let slowest = { comments: 0, seconds: 0 };
  for (const comments of days) {
    const day = comments[0]?.day;
    if (!day) continue;
    await db.query("insert into days (day, published_at) values ($1, $2)", [day, comments[0].at]);
    for (let i = 0; i < comments.length; i += 5000) {
      await db.query(
        `insert into comment_inbox (ig_comment_id, day, username, mentions, commented_at, source)
         select x.id, x.day, x.username, array(select jsonb_array_elements_text(x.mentions)), x.at, 'manual'
         from jsonb_to_recordset($1::jsonb) as x(id text, day int, username text, mentions jsonb, at timestamptz)`,
        [JSON.stringify(comments.slice(i, i + 5000))],
      );
    }
    const started = performance.now();
    const summary = await processInbox(store, BATCH);
    const seconds = (performance.now() - started) / 1000;
    if (comments.length > slowest.comments) slowest = { comments: comments.length, seconds };
    console.log(
      [
        day,
        comments.length,
        summary.newStars,
        summary.invitesResolved,
        summary.constellationsCompleted,
        seconds.toFixed(1),
      ]
        .map((v, i) => String(v).padStart([3, 12, 7, 13, 15, 9][i]))
        .join(" "),
    );
  }

  // ---------------------------------------------------------------- checks
  const want = expected(days);
  const got = await one<Record<string, number>>(`select
    (select count(*)::int from stars) as stars,
    (select count(*)::int from stars where status = 'review') as review,
    (select count(*)::int from participations) as participations,
    (select coalesce(sum(days_count), 0)::int from stars) as days_total,
    (select count(*)::int from constellations where status = 'complete') as complete,
    (select count(*)::int from constellations where status = 'forming') as forming,
    (select coalesce(sum(star_count), 0)::int from constellations) as star_count_total,
    (select coalesce(sum(invited_count), 0)::int from stars) as invited_total,
    (select count(*)::int from stars where invited_by is not null) as invited,
    (select count(*)::int from pending_invites) as pending_invites,
    (select count(*)::int from comment_inbox where not processed) as unprocessed,
    (select total_stars from sky_state) as sky_total,
    (select total_constellations from sky_state) as sky_constellations,
    (select stage from sky_state) as stage,
    (select count(*)::int from planets where unlocked_day is not null) as planets`);

  const pairs = await q<{ username: string; inviter: string }>(
    "select s.username, i.username as inviter from stars s join stars i on i.id = s.invited_by",
  );
  const counts = await q<{ username: string; invited_count: number }>(
    "select username, invited_count from stars where invited_count > 0",
  );
  const maxInvited = Math.max(0, ...counts.map((c) => c.invited_count));
  const planetsExpected = [1000, 2500, 5000, 10000, 26400, 100000, 300000, 1000000].filter(
    (t) => t <= want.stars,
  ).length;
  const completeExpected = Math.floor(want.stars / 300);

  const checks: [string, boolean, string][] = [
    ["Estrellas", got.stars === want.stars, `${got.stars} de ${want.stars}`],
    [
      "Participaciones",
      got.participations === want.participations,
      `${got.participations} de ${want.participations}`,
    ],
    [
      "Días comentando = participaciones",
      got.days_total === got.participations,
      `${got.days_total}`,
    ],
    [
      "Constelaciones completas",
      got.complete === completeExpected,
      `${got.complete} de ${completeExpected}`,
    ],
    ["Una sola en formación", got.forming === 1, `${got.forming}`],
    [
      "Estrellas por constelación suman el total",
      got.star_count_total === got.stars,
      `${got.star_count_total}`,
    ],
    [
      "Invitaciones",
      got.invited === want.invitedBy.size,
      `${got.invited} de ${want.invitedBy.size}`,
    ],
    [
      "Quién invitó a quién (primera mención)",
      pairs.length === want.invitedBy.size &&
        pairs.every((p) => want.invitedBy.get(p.username) === p.inviter),
      `${pairs.filter((p) => want.invitedBy.get(p.username) === p.inviter).length} coinciden`,
    ],
    [
      "Contadores de invitados",
      got.invited_total === got.invited &&
        counts.length === want.invitedCount.size &&
        counts.every((c) => want.invitedCount.get(c.username) === c.invited_count),
      `máximo ${maxInvited} por estrella`,
    ],
    [
      "Invitaciones pendientes",
      got.pending_invites === want.pending,
      `${got.pending_invites} de ${want.pending}`,
    ],
    ["Sin comentarios pendientes", got.unprocessed === 0, `${got.unprocessed}`],
    [
      "Estado general",
      got.sky_total === got.stars && got.sky_constellations === got.complete,
      `${got.sky_total} estrellas, ${got.sky_constellations} constelaciones`,
    ],
    [
      "Etapa",
      got.stage === (got.complete >= 1000 ? 3 : got.complete >= 88 ? 2 : 1),
      `etapa ${got.stage}`,
    ],
    [
      "Planetas desbloqueados",
      got.planets === planetsExpected,
      `${got.planets} de ${planetsExpected}`,
    ],
  ];

  console.log("\nComprobaciones:");
  for (const [label, ok, detail] of checks)
    console.log(`  ${ok ? "OK   " : "FALLA"} ${label}: ${detail}`);
  console.log(`\nEn revisión por palabras bloqueadas: ${got.review}`);
  console.log(
    `Día más grande: ${slowest.comments} comentarios procesados en ${slowest.seconds.toFixed(1)} s`,
  );
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
} finally {
  await db.end();
}
