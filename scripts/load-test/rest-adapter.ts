// A small stand-in for PostgREST, for the load test only: it answers the REST calls that
// supabase-js makes from the processing and publishing code by running the equivalent SQL on a
// local Postgres, under the requested role and inside a transaction, as PostgREST does.
// It supports only what this project uses: select with eq/neq/in/is filters, order, limit and
// offset, count, to-one embeds, insert/upsert, update and rpc.
import type pg from "pg";

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

interface Embed {
  name: string;
  columns: string[];
}

function parseSelect(select: string | null): { columns: string[]; embeds: Embed[] } {
  const columns: string[] = [];
  const embeds: Embed[] = [];
  const text = select ?? "*";
  let depth = 0;
  let current = "";
  const parts: string[] = [];
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  for (const part of parts) {
    const embed = /^(\w+)\((.*)\)$/.exec(part);
    if (embed) embeds.push({ name: embed[1], columns: embed[2].split(",").map((c) => c.trim()) });
    else columns.push(part);
  }
  return { columns, embeds };
}

export function createRestFetch(
  pool: pg.Pool,
  options: { role: string; statementTimeout?: string },
): typeof fetch {
  const fkCache = new Map<string, { column: string; target: string } | null>();

  async function foreignKey(client: pg.PoolClient, table: string, target: string) {
    const key = `${table}->${target}`;
    if (!fkCache.has(key)) {
      const { rows } = await client.query(
        `select a.attname as column, af.attname as target
         from pg_constraint c
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
         join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
         where c.contype = 'f' and c.conrelid = $1::regclass and c.confrelid = $2::regclass`,
        [`public.${table}`, `public.${target}`],
      );
      fkCache.set(key, rows[0] ?? null);
    }
    return fkCache.get(key)!;
  }

  function filters(params: URLSearchParams, values: unknown[]): string[] {
    const reserved = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
    const where: string[] = [];
    for (const [column, raw] of params) {
      if (reserved.has(column)) continue;
      const dot = raw.indexOf(".");
      const op = raw.slice(0, dot);
      const value = raw.slice(dot + 1);
      const col = `t.${ident(column)}`;
      if (
        op === "eq" ||
        op === "neq" ||
        op === "gt" ||
        op === "gte" ||
        op === "lt" ||
        op === "lte"
      ) {
        const sqlOp = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[op];
        values.push(value);
        where.push(`${col} ${sqlOp} $${values.length}`);
      } else if (op === "in") {
        const list = value
          .replace(/^\(|\)$/g, "")
          .split(",")
          .map((v) => v.replace(/^"|"$/g, ""));
        values.push(list);
        where.push(`${col} = any($${values.length})`);
      } else if (op === "is") {
        where.push(`${col} is ${value === "null" ? "null" : value === "true" ? "true" : "false"}`);
      } else if (op === "not" && value.startsWith("is.")) {
        where.push(`${col} is not ${value.slice(3)}`);
      } else {
        throw new Error(`rest-adapter: unsupported filter ${column}=${raw}`);
      }
    }
    return where;
  }

  async function selectSql(
    client: pg.PoolClient,
    table: string,
    params: URLSearchParams,
    values: unknown[],
  ) {
    const { columns, embeds } = parseSelect(params.get("select"));
    const list = columns.map((c) => (c === "*" ? "t.*" : `t.${ident(c)}`));
    for (const embed of embeds) {
      const fk = await foreignKey(client, table, embed.name);
      if (!fk) throw new Error(`rest-adapter: no foreign key from ${table} to ${embed.name}`);
      const fields = embed.columns.map((c) => `'${c}', r.${ident(c)}`).join(", ");
      list.push(
        `(select json_build_object(${fields}) from public.${ident(embed.name)} r where r.${ident(fk.target)} = t.${ident(fk.column)}) as ${ident(embed.name)}`,
      );
    }
    const where = filters(params, values);
    const order = (params.get("order") ?? "")
      .split(",")
      .filter(Boolean)
      .map((o) => {
        const [col, dir, nulls] = o.split(".");
        return `t.${ident(col)} ${dir === "desc" ? "desc" : "asc"}${nulls ? ` ${nulls.replace("nulls", "nulls ")}` : ""}`;
      });
    let sql = `select ${list.join(", ") || "t.*"} from public.${ident(table)} t`;
    if (where.length) sql += ` where ${where.join(" and ")}`;
    if (order.length) sql += ` order by ${order.join(", ")}`;
    if (params.get("limit")) sql += ` limit ${Number(params.get("limit"))}`;
    if (params.get("offset")) sql += ` offset ${Number(params.get("offset"))}`;
    return { sql, where };
  }

  async function handle(client: pg.PoolClient, request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/rest\/v1\//, "");
    const params = url.searchParams;
    const prefer = request.headers.get("prefer") ?? "";
    const wantsObject = (request.headers.get("accept") ?? "").includes("vnd.pgrst.object");
    const values: unknown[] = [];
    const body =
      request.method === "GET" || request.method === "HEAD" ? null : await request.text();

    const respond = (rows: unknown[], extraHeaders: Record<string, string> = {}) => {
      if (wantsObject) {
        if (rows.length !== 1) {
          return Response.json(
            {
              code: "PGRST116",
              message: `JSON object requested, multiple (or no) rows returned`,
              details: `${rows.length} rows`,
            },
            { status: 406 },
          );
        }
        return Response.json(rows[0], { headers: extraHeaders });
      }
      return Response.json(rows, { headers: extraHeaders });
    };

    if (path.startsWith("rpc/")) {
      const fn = path.slice(4);
      const args = body ? (JSON.parse(body) as Record<string, unknown>) : {};
      const named = Object.entries(args).map(([name, value]) => {
        values.push(value !== null && typeof value === "object" ? JSON.stringify(value) : value);
        return `${ident(name)} => $${values.length}`;
      });
      const { rows: info } = await client.query(
        `select p.proretset as set, t.typtype = 'c' or p.prorettype = 'record'::regtype as composite
         from pg_proc p join pg_type t on t.oid = p.prorettype
         where p.proname = $1 and p.pronamespace = 'public'::regnamespace limit 1`,
        [fn],
      );
      if (!info.length) throw new Error(`rest-adapter: unknown function ${fn}`);
      const call = `public.${ident(fn)}(${named.join(", ")})`;
      if (info[0].set || info[0].composite) {
        const { rows } = await client.query(
          `select coalesce(json_agg(t), '[]'::json) as j from ${call} t`,
          values,
        );
        const data = rows[0].j as Record<string, unknown>[];
        // A set of a scalar type comes back as a list of values, as PostgREST does.
        if (!info[0].composite) return Response.json(data.map((r) => Object.values(r)[0]));
        return respond(data);
      }
      const { rows } = await client.query(`select to_json(${call}) as j`, values);
      return Response.json(rows[0].j);
    }

    const table = path;
    if (request.method === "GET" || request.method === "HEAD") {
      const { sql } = await selectSql(client, table, params, values);
      const headers: Record<string, string> = {};
      if (prefer.includes("count=exact")) {
        const countValues: unknown[] = [];
        const where = filters(params, countValues);
        const { rows } = await client.query(
          `select count(*)::int as n from public.${ident(table)} t${where.length ? ` where ${where.join(" and ")}` : ""}`,
          countValues,
        );
        headers["content-range"] = `*/${rows[0].n}`;
      }
      if (request.method === "HEAD") return new Response(null, { status: 200, headers });
      const { rows } = await client.query(
        `select coalesce(json_agg(q), '[]'::json) as j from (${sql}) q`,
        values,
      );
      return respond(rows[0].j, headers);
    }

    const returning = prefer.includes("return=representation");
    const { columns: selected } = parseSelect(params.get("select"));
    const back = returning
      ? ` returning ${selected.map((c) => (c === "*" ? "*" : ident(c))).join(", ")}`
      : "";

    if (request.method === "POST") {
      const payload = JSON.parse(body ?? "[]");
      const rows = Array.isArray(payload) ? payload : [payload];
      if (!rows.length) return respond([]);
      const columns = (params.get("columns") ?? Object.keys(rows[0]).join(","))
        .split(",")
        .map((c) => c.replace(/"/g, ""));
      values.push(JSON.stringify(rows));
      let sql = `insert into public.${ident(table)} (${columns.map(ident).join(", ")})
        select ${columns.map(ident).join(", ")} from json_populate_recordset(null::public.${ident(table)}, $1)`;
      const conflict = params.get("on_conflict");
      if (prefer.includes("resolution=ignore-duplicates")) {
        sql += ` on conflict${conflict ? ` (${conflict.split(",").map(ident).join(", ")})` : ""} do nothing`;
      } else if (prefer.includes("resolution=merge-duplicates")) {
        const target = conflict
          ? conflict.split(",")
          : (
              await client.query(
                `select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
                 where i.indrelid = $1::regclass and i.indisprimary`,
                [`public.${table}`],
              )
            ).rows.map((r) => r.attname as string);
        sql += ` on conflict (${target.map(ident).join(", ")}) do update set ${columns
          .map((c) => `${ident(c)} = excluded.${ident(c)}`)
          .join(", ")}`;
      }
      const { rows: out } = await client.query(
        returning
          ? `with w as (${sql}${back}) select coalesce(json_agg(w), '[]'::json) as j from w`
          : sql,
        values,
      );
      return returning ? respond(out[0].j) : new Response(null, { status: 201 });
    }

    if (request.method === "PATCH") {
      const changes = JSON.parse(body ?? "{}") as Record<string, unknown>;
      const columns = Object.keys(changes);
      values.push(JSON.stringify(changes));
      const where = filters(params, values);
      const sql = `update public.${ident(table)} t set (${columns.map(ident).join(", ")}) =
        (select ${columns.map((c) => `r.${ident(c)}`).join(", ")} from json_populate_record(null::public.${ident(table)}, $1) r)
        ${where.length ? `where ${where.join(" and ")}` : ""}`;
      const { rows: out } = await client.query(
        returning
          ? `with w as (${sql}${back}) select coalesce(json_agg(w), '[]'::json) as j from w`
          : sql,
        values,
      );
      return returning ? respond(out[0].j) : new Response(null, { status: 204 });
    }

    if (request.method === "DELETE") {
      const where = filters(params, values);
      await client.query(
        `delete from public.${ident(table)} t ${where.length ? `where ${where.join(" and ")}` : ""}`,
        values,
      );
      return new Response(null, { status: 204 });
    }
    throw new Error(`rest-adapter: unsupported ${request.method} ${path}`);
  }

  return async (input, init) => {
    const request = new Request(input, init);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(`set local role ${options.role}`);
      if (options.statementTimeout) {
        await client.query(`set local statement_timeout = '${options.statementTimeout}'`);
      }
      const response = await handle(client, request);
      await client.query("commit");
      return response;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      const message = (error as Error).message;
      if (message.startsWith("rest-adapter:")) throw error;
      return Response.json(
        { code: (error as { code?: string }).code ?? "XX000", message },
        { status: 400 },
      );
    } finally {
      client.release();
    }
  };
}
