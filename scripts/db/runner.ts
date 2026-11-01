import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Minimal SQL interface shared by node-postgres (Supabase) and PGlite (tests).
export interface SqlRunner {
  exec(sql: string): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Figure {
  slug: string;
  name: string;
  anchors: [number, number][];
  edges: [number, number][];
  handmade: boolean;
}

const root = join(import.meta.dirname, "..", "..", "supabase");
const migrationsDir = join(root, "migrations");
const seedDir = join(root, "seed");

export function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export function readFigures(): Figure[] {
  return JSON.parse(readFileSync(join(seedDir, "figures.json"), "utf8"));
}

// Applies pending migrations in order, each one in its own transaction. Returns the applied names.
export async function applyMigrations(db: SqlRunner): Promise<string[]> {
  await db.exec(`
    create schema if not exists app_private;
    create table if not exists app_private.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);
  const done = new Set(
    (await db.query<{ name: string }>("select name from app_private.schema_migrations")).map(
      (r) => r.name,
    ),
  );

  const applied: string[] = [];
  for (const name of migrationFiles()) {
    if (done.has(name)) continue;
    const sql = readFileSync(join(migrationsDir, name), "utf8");
    await db.exec("begin");
    try {
      await db.exec(sql);
      await db.query("insert into app_private.schema_migrations (name) values ($1)", [name]);
      await db.exec("commit");
    } catch (error) {
      await db.exec("rollback");
      throw new Error(`Migration ${name} failed: ${(error as Error).message}`, { cause: error });
    }
    applied.push(name);
  }
  return applied;
}

// Seeds are idempotent: running them again updates or skips existing rows.
export async function applySeeds(db: SqlRunner): Promise<void> {
  await db.exec("begin");
  try {
    for (const figure of readFigures()) {
      // A figure already used by a constellation is never changed: its stars were placed on it.
      await db.query(
        `insert into figures (slug, name, anchors, edges, handmade)
         values ($1, $2, $3::jsonb, $4::jsonb, $5)
         on conflict (slug) do update
           set name = excluded.name, anchors = excluded.anchors,
               edges = excluded.edges, handmade = excluded.handmade
           where not exists (select 1 from constellations c where c.figure_id = figures.id)`,
        [
          figure.slug,
          figure.name,
          JSON.stringify(figure.anchors),
          JSON.stringify(figure.edges),
          figure.handmade,
        ],
      );
    }
    for (const file of readdirSync(seedDir)
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      await db.exec(readFileSync(join(seedDir, file), "utf8"));
    }
    await db.exec("commit");
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
