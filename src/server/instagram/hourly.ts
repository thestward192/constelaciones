import type { SupabaseClient } from "@supabase/supabase-js";
import { runJob } from "../admin/jobs";
import { processInbox, supabaseStore, type ProcessSummary } from "../processing";
import { publishSky, type PublishSummary } from "../publish/publish";
import { supabaseStorage } from "../storage";
import { InstagramApi, InstagramError, type Fetch } from "./client";
import { importDayFromInstagram, type InstagramImportSummary } from "./import";
import { getInstagramToken, recordTokenError, refreshIfDue, type RefreshResult } from "./token";

/** Open days read on each run, newest first (normally just today's video). */
const OPEN_DAYS = 3;

export interface HourlySummary {
  token: RefreshResult | "missing";
  imports: (InstagramImportSummary | { day: number; error: string })[];
  processed: ProcessSummary;
  published: PublishSummary | null;
}

/** The API for the stored token, or null when Instagram is not connected yet. */
export async function connectInstagram(db: SupabaseClient, fetcher?: Fetch) {
  const token = await getInstagramToken(db);
  return token ? { token, api: new InstagramApi(token.access_token, fetcher) } : null;
}

/**
 * Import → process → publish. An Instagram failure is recorded and does not stop the rest, so
 * lists imported by hand are still processed and published.
 */
export async function runHourly(db: SupabaseClient, fetcher?: Fetch): Promise<HourlySummary> {
  const imports: HourlySummary["imports"] = [];
  let tokenResult: HourlySummary["token"] = "missing";

  const stored = await getInstagramToken(db);
  if (stored) {
    const refreshed = await refreshIfDue(db, stored, fetcher);
    tokenResult = refreshed.result;
    const api = new InstagramApi(refreshed.token.access_token, fetcher);
    const { data: days, error } = await db
      .from("days")
      .select("day")
      .eq("closed", false)
      .not("ig_media_id", "is", null)
      .order("day", { ascending: false })
      .limit(OPEN_DAYS);
    if (error) throw new Error(`Could not read open days: ${error.message}`);
    for (const { day } of days ?? []) {
      try {
        imports.push(
          await runJob(db, "import", () =>
            importDayFromInstagram(db, api, day, refreshed.token.username),
          ),
        );
      } catch (error) {
        const message = (error as Error).message;
        if (error instanceof InstagramError && error.tokenInvalid)
          await recordTokenError(db, message);
        imports.push({ day, error: message });
      }
    }
  }

  const processed = await runJob(db, "process", () => processInbox(supabaseStore(db)));
  const published = processed.busy
    ? null
    : await runJob(db, "publish", () => publishSky(db, supabaseStorage(db)));
  return { token: tokenResult, imports, processed, published };
}
