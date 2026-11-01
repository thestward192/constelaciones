import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import type { SqlRunner } from "../../scripts/db/runner";

// An in-memory Postgres that mimics the Supabase roles and their default grants,
// so the migrations' revokes and RLS are tested against the same starting point.
export async function createTestDatabase(): Promise<{ pg: PGlite; db: SqlRunner }> {
  const pg = await PGlite.create({ extensions: { pg_trgm } });
  await pg.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  const db: SqlRunner = {
    async exec(sql) {
      await pg.exec(sql);
    },
    async query<T>(sql: string, params?: unknown[]) {
      return (await pg.query<T>(sql, params)).rows;
    },
  };
  return { pg, db };
}

// Runs fn as the given role and always returns to the superuser afterwards.
export async function asRole<T>(pg: PGlite, role: string, fn: () => Promise<T>): Promise<T> {
  await pg.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await pg.exec("reset role");
  }
}
