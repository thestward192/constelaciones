// Schedules the hourly job in Supabase: pg_cron calls POST <site>/api/jobs/hourly with pg_net,
// sending CRON_SECRET (kept in Supabase Vault, never in the SQL of the job).
// Usage:
//   npm run cron:schedule -- --check                 checks that pg_cron and pg_net are available
//   npm run cron:schedule -- --url https://dominio   creates or updates the job
//   npm run cron:schedule -- --status                shows the job and its last runs
//   npm run cron:schedule -- --remove                removes the job
import { existsSync } from "node:fs";
import pg from "pg";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const JOB = "constelaciones-hourly";
const SECRET_NAME = "constelaciones_cron_secret";
const SCHEDULE = "5 * * * *"; // five past every hour

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Falta SUPABASE_DB_URL en .env.local.");
  process.exit(1);
}
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
const query = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await client.query(sql, params)).rows as T[];

try {
  if (flag("check")) {
    const rows = await query<{ name: string; installed_version: string | null }>(
      "select name, installed_version from pg_available_extensions where name in ('pg_cron', 'pg_net') order by name",
    );
    for (const name of ["pg_cron", "pg_net"]) {
      const row = rows.find((r) => r.name === name);
      console.log(
        `${name}: ${row ? (row.installed_version ? `instalada (${row.installed_version})` : "disponible") : "NO disponible"}`,
      );
    }
    const vault = await query("select 1 from pg_namespace where nspname = 'vault'");
    console.log(`vault: ${vault.length ? "disponible" : "NO disponible"}`);
  } else if (flag("remove")) {
    const jobs = await query("select 1 from pg_namespace where nspname = 'cron'");
    if (jobs.length)
      await query("select cron.unschedule(jobid) from cron.job where jobname = $1", [JOB]);
    console.log("Tarea quitada.");
  } else if (flag("status")) {
    const job = await query(
      "select jobid, schedule, active, command from cron.job where jobname = $1",
      [JOB],
    );
    if (!job.length) {
      console.log("No hay tarea programada.");
    } else {
      console.log(job[0]);
      const runs = await query(
        `select start_time, status, return_message from cron.job_run_details
         where jobid = $1 order by start_time desc limit 5`,
        [job[0].jobid],
      );
      console.table(runs);
      const responses = await query(
        "select created, status_code, left(content, 200) as content from net._http_response order by created desc limit 5",
      );
      console.table(responses);
    }
  } else {
    const site = option("url") ?? process.env.NEXT_PUBLIC_SITE_URL;
    const secret = process.env.CRON_SECRET;
    if (!site || !/^https:\/\/[^/\s]+$/.test(site.replace(/\/$/, ""))) {
      console.error("Indica la dirección pública del sitio: --url https://dominio (sin ruta).");
      process.exit(1);
    }
    if (!secret) {
      console.error("Falta CRON_SECRET en .env.local.");
      process.exit(1);
    }
    const endpoint = `${site.replace(/\/$/, "")}/api/jobs/hourly`;

    await query("create extension if not exists pg_cron with schema pg_catalog");
    await query("create extension if not exists pg_net with schema extensions");

    const existing = await query<{ id: string }>("select id from vault.secrets where name = $1", [
      SECRET_NAME,
    ]);
    if (existing.length)
      await query("select vault.update_secret($1, $2)", [existing[0].id, secret]);
    else await query("select vault.create_secret($1, $2)", [secret, SECRET_NAME]);

    // The secret is read from Vault each time the job runs.
    const command = `
      select net.http_post(
        url := ${pg.escapeLiteral(endpoint)},
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets where name = ${pg.escapeLiteral(SECRET_NAME)}
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 300000
      );`;
    await query("select cron.schedule($1, $2, $3)", [JOB, SCHEDULE, command]);
    console.log(`Tarea programada: cada hora (minuto 5) → POST ${endpoint}`);
  }
} finally {
  await client.end();
}
