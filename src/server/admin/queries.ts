import "server-only";
import { getAdminClient } from "../supabase/admin";

// Reads for the admin pages (service role, after requireAdmin()).

export interface DayRow {
  day: number;
  ig_media_id: string | null;
  published_at: string | null;
  challenge_type: string | null;
  challenge_goal: number | null;
  challenge_progress: number;
  challenge_met: boolean | null;
  challenge_level: number;
  shooting_count: number | null;
  shooting_drawn_at: string | null;
  closed: boolean;
}

export interface DayStats {
  comments: number;
  pending: number;
  participations: number;
  newStars: number;
  returning: number;
  invites: number;
  review: number;
  constellationsCompleted: number;
}

export interface SkyTotals {
  current_day: number | null;
  total_stars: number;
  total_constellations: number;
  stage: number;
}

const DAY_COLUMNS =
  "day, ig_media_id, published_at, challenge_type, challenge_goal, challenge_progress, challenge_met, challenge_level, shooting_count, shooting_drawn_at, closed";

function must<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export async function listDays(): Promise<DayRow[]> {
  return must(
    await getAdminClient()
      .from("days")
      .select(DAY_COLUMNS)
      .order("day", { ascending: false })
      .limit(400),
  );
}

export async function getDay(day: number): Promise<DayRow | null> {
  return must(await getAdminClient().from("days").select(DAY_COLUMNS).eq("day", day).maybeSingle());
}

/** A day's challenge right now (the stored progress only changes when publishing or closing). */
export async function liveChallenge(day: number): Promise<{ progress: number; best: number }> {
  const db = getAdminClient();
  const [progress, best] = await Promise.all([
    db.rpc("challenge_progress", { p_day: day }),
    db.rpc("best_day_before", { p_day: day }),
  ]);
  return { progress: must(progress) as number, best: must(best) as number };
}

export async function dayStats(day: number): Promise<DayStats> {
  return must(await getAdminClient().rpc("day_stats", { p_day: day })) as DayStats;
}

export async function skyTotals(): Promise<SkyTotals> {
  return must(
    await getAdminClient()
      .from("sky_state")
      .select("current_day, total_stars, total_constellations, stage")
      .single(),
  );
}

export async function shootingWinners(day: number) {
  const rows = must(
    await getAdminClient()
      .from("shooting_stars")
      .select("rank, stars(username, constellation_id)")
      .eq("day", day)
      .order("rank"),
  ) as unknown as { rank: number; stars: { username: string; constellation_id: number } | null }[];
  return rows.map((r) => ({
    rank: r.rank,
    username: r.stars?.username ?? "",
    constellation: r.stars?.constellation_id ?? 0,
  }));
}

export interface ConstellationRow {
  id: number;
  name: string | null;
  status: string;
  star_count: number;
  completed_day: number | null;
}

export async function constellationsCompletedOn(day: number): Promise<ConstellationRow[]> {
  return must(
    await getAdminClient()
      .from("constellations")
      .select("id, name, status, star_count, completed_day")
      .eq("completed_day", day)
      .order("id"),
  );
}

export async function recentConstellations(
  limit = 40,
  around?: number,
): Promise<ConstellationRow[]> {
  let query = getAdminClient()
    .from("constellations")
    .select("id, name, status, star_count, completed_day")
    .neq("status", "reserved");
  if (around) query = query.gte("id", Math.max(1, around - 5)).lte("id", around + 5);
  return must(await query.order("id", { ascending: false }).limit(limit));
}

export interface ModerationStar {
  id: number;
  username: string;
  constellation_id: number;
  born_day: number;
  status: string;
}

export async function starsWithStatus(
  status: "review" | "hidden",
  limit = 200,
): Promise<ModerationStar[]> {
  return must(
    await getAdminClient()
      .from("stars")
      .select("id, username, constellation_id, born_day, status")
      .eq("status", status)
      .order("id", { ascending: false })
      .limit(limit),
  );
}

export async function blockedWords(): Promise<string[]> {
  const rows = must(await getAdminClient().from("blocked_words").select("word").order("word")) as {
    word: string;
  }[];
  return rows.map((r) => r.word);
}
