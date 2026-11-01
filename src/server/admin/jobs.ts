import type { SupabaseClient } from "@supabase/supabase-js";

export type JobKind = "import" | "process" | "publish" | "draw";

export interface JobRun {
  kind: JobKind;
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  summary: Record<string, unknown> | null;
  error: string | null;
}

/** Runs a job and keeps a record of it (start, end, result or error) for the panel. */
export async function runJob<T>(
  db: SupabaseClient,
  kind: JobKind,
  job: () => Promise<T>,
): Promise<T> {
  const { data } = await db.from("job_runs").insert({ kind }).select("id").single();
  const id = data?.id as number | undefined;
  try {
    const result = await job();
    if (id) {
      await db
        .from("job_runs")
        .update({ finished_at: new Date().toISOString(), ok: true, summary: result })
        .eq("id", id);
    }
    return result;
  } catch (error) {
    if (id) {
      await db
        .from("job_runs")
        .update({
          finished_at: new Date().toISOString(),
          ok: false,
          error: (error as Error).message,
        })
        .eq("id", id);
    }
    throw error;
  }
}

/** The latest run of each kind. */
export async function lastRuns(db: SupabaseClient): Promise<Partial<Record<JobKind, JobRun>>> {
  const kinds: JobKind[] = ["import", "process", "publish", "draw"];
  const results = await Promise.all(
    kinds.map((kind) =>
      db
        .from("job_runs")
        .select("kind, started_at, finished_at, ok, summary, error")
        .eq("kind", kind)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  );
  return Object.fromEntries(
    results.filter((r) => r.data).map((r) => [r.data!.kind, r.data as JobRun]),
  ) as Partial<Record<JobKind, JobRun>>;
}
