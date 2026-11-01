// Applies migrations and seeds to the Supabase database in SUPABASE_DB_URL (.env.local).
// Usage: npm run db:migrate
import { existsSync } from "node:fs";
import pg from "pg";
import { applyMigrations, applySeeds, type SqlRunner } from "./db/runner";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Falta SUPABASE_DB_URL en .env.local (Supabase > Connect > Session pooler).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const db: SqlRunner = {
  async exec(sql) {
    await client.query(sql);
  },
  async query(sql, params) {
    return (await client.query(sql, params)).rows;
  },
};

try {
  const applied = await applyMigrations(db);
  console.log(
    applied.length ? `Migraciones aplicadas: ${applied.join(", ")}` : "Sin migraciones pendientes.",
  );
  await applySeeds(db);
  console.log("Semillas aplicadas.");
} finally {
  await client.end();
}
