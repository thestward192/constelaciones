import type { SupabaseClient } from "@supabase/supabase-js";
import { IMMUTABLE, SHORT, type PublicStorage } from "../storage";
import {
  buildConstellationFile,
  indexConstellation,
  indexHash,
  paths,
  STAGES,
  type ConstellationRow,
  type SkyIndex,
  type StarRow,
} from "./files";
import { renderOverview } from "./overview";

export interface PublishSummary {
  busy: boolean;
  constellationFiles: number;
  indexVersion: number | null;
  overviewRegenerated: boolean;
  unchanged: boolean;
}

interface SkyStateRow {
  current_day: number | null;
  total_stars: number;
  total_constellations: number;
  stage: number;
  index_version: number;
  index_hash: string | null;
  overview_path: string | null;
  overview_radius: number;
  overview_constellations: number;
}

const LOCK_SECONDS = 280;
const CONCURRENCY = 6;
const PAGE = 1000;

const CONSTELLATION_COLUMNS =
  "id, name, status, star_count, completed_day, center_x, center_y, scale, file_version, figure_id";

/**
 * Generates what the public page downloads and uploads it with long-lived, versioned names:
 * one file per changed constellation, the spiral image when new constellations completed,
 * a new index when anything changed, and finally latest.json pointing to that index.
 */
export async function publishSky(
  db: SupabaseClient,
  storage: PublicStorage,
): Promise<PublishSummary> {
  const summary: PublishSummary = {
    busy: false,
    constellationFiles: 0,
    indexVersion: null,
    overviewRegenerated: false,
    unchanged: false,
  };

  const { data: locked, error: lockError } = await db.rpc("claim_publish_lock", {
    p_seconds: LOCK_SECONDS,
  });
  if (lockError) throw new Error(`claim_publish_lock failed: ${lockError.message}`);
  if (!locked) return { ...summary, busy: true };

  try {
    await storage.ensureReady();
    summary.constellationFiles = await publishConstellations(db, storage);

    const state = must(
      await db
        .from("sky_state")
        .select(
          "current_day, total_stars, total_constellations, stage, index_version, index_hash, overview_path, overview_radius, overview_constellations",
        )
        .single<SkyStateRow>(),
      "sky_state",
    );
    const constellations = await selectAll<ConstellationRow>(
      db,
      "constellations",
      CONSTELLATION_COLUMNS,
      (q) => q.neq("status", "reserved").order("id"),
    );
    const nextVersion = state.index_version + 1;

    // The spiral image only changes when constellations complete (or on the first publish).
    let overview: SkyIndex["overview"] = null;
    const complete = constellations.filter((c) => c.status === "complete").length;
    if (state.overview_path && state.overview_constellations === complete) {
      overview = { path: state.overview_path, radius: state.overview_radius };
    } else {
      const { image, radius } = await renderOverview(
        constellations.map((c) => ({
          x: c.center_x,
          y: c.center_y,
          r: c.scale,
          count: c.star_count,
          complete: c.status === "complete",
        })),
      );
      overview = { path: paths.overview(nextVersion), radius: Math.round(radius) };
      await storage.put(overview.path, image, {
        contentType: "image/webp",
        cacheSeconds: IMMUTABLE,
      });
      summary.overviewRegenerated = true;
    }

    const content = await indexContent(db, state, constellations, overview);
    const hash = indexHash(content);
    if (hash === state.index_hash && !summary.overviewRegenerated) {
      return { ...summary, unchanged: true, indexVersion: state.index_version };
    }

    const index: SkyIndex = { v: nextVersion, generatedAt: new Date().toISOString(), ...content };
    await storage.put(paths.index(nextVersion), JSON.stringify(index), {
      contentType: "application/json",
      cacheSeconds: IMMUTABLE,
    });
    await storage.put(paths.latest, JSON.stringify({ index: paths.index(nextVersion) }), {
      contentType: "application/json",
      cacheSeconds: SHORT,
      overwrite: true,
    });

    const { error } = await db
      .from("sky_state")
      .update({
        index_version: nextVersion,
        index_hash: hash,
        overview_path: overview.path,
        overview_radius: overview.radius,
        overview_constellations: complete,
      })
      .eq("id", true);
    if (error) throw new Error(`Could not update sky_state: ${error.message}`);
    summary.indexVersion = nextVersion;

    await removeOldSkyFiles(storage, nextVersion, overview.path);
    return summary;
  } finally {
    await db.rpc("release_publish_lock");
  }
}

/** Regenerates the file of every constellation flagged as changed. Returns how many. */
async function publishConstellations(db: SupabaseClient, storage: PublicStorage): Promise<number> {
  const { data, error } = await db.rpc("claim_dirty_constellations");
  if (error) throw new Error(`claim_dirty_constellations failed: ${error.message}`);
  const claimed = (data ?? []) as { id: number; file_version: number }[];
  if (!claimed.length) return 0;

  const figures = must(await db.from("figures").select("id, edges"), "figures") as {
    id: number;
    edges: [number, number][];
  }[];
  const edgesByFigure = new Map(figures.map((f) => [f.id, f.edges]));

  const pending = new Set(claimed.map((c) => c.id));
  try {
    const queue = [...claimed];
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
          await publishConstellation(db, storage, item.id, item.file_version + 1, edgesByFigure);
          pending.delete(item.id);
        }
      }),
    );
  } catch (error) {
    // Flag again whatever was not published, so the next run retries it.
    if (pending.size)
      await db
        .from("constellations")
        .update({ dirty: true })
        .in("id", [...pending]);
    throw error;
  }
  return claimed.length;
}

async function publishConstellation(
  db: SupabaseClient,
  storage: PublicStorage,
  id: number,
  version: number,
  edgesByFigure: Map<number, [number, number][]>,
) {
  const c = must(
    await db.from("constellations").select(CONSTELLATION_COLUMNS).eq("id", id).single(),
    `constellation ${id}`,
  ) as ConstellationRow & { figure_id: number };
  const stars = must(
    await db
      .from("stars")
      .select("slot_index, username, x, y, days_count, invited_count, shooting_days, gold_border")
      .eq("constellation_id", id)
      .eq("status", "active")
      .limit(300),
    `stars of ${id}`,
  ) as StarRow[];

  let figure = null;
  if (c.status === "complete") {
    const anchors = must(
      await db
        .from("slots")
        .select("anchor_index, x, y")
        .eq("constellation_id", id)
        .eq("is_anchor", true),
      `anchors of ${id}`,
    ) as { anchor_index: number; x: number; y: number }[];
    figure = { anchors, edges: edgesByFigure.get(c.figure_id) ?? [] };
  }

  const file = buildConstellationFile(c, version, stars, figure);
  await storage.put(paths.constellation(id, version), JSON.stringify(file), {
    contentType: "application/json",
    cacheSeconds: IMMUTABLE,
  });
  const { error } = await db.from("constellations").update({ file_version: version }).eq("id", id);
  if (error) throw new Error(`Could not update constellation ${id}: ${error.message}`);

  // Keep the current and the previous version (a page may still hold the previous index).
  if (version > 2) await storage.remove([paths.constellation(id, version - 2)]).catch(() => {});
}

async function indexContent(
  db: SupabaseClient,
  state: {
    current_day: number | null;
    total_stars: number;
    total_constellations: number;
    stage: number;
  },
  constellations: ConstellationRow[],
  overview: SkyIndex["overview"],
): Promise<Omit<SkyIndex, "v" | "generatedAt">> {
  const day = state.current_day;
  const [planets, challenge, shooting, unlocks] = await Promise.all([
    db.from("planets").select("id, name, threshold, orbit_radius, unlocked_day").order("id"),
    day
      ? db
          .from("days")
          .select("day, challenge_type, challenge_goal, challenge_progress, challenge_met")
          .eq("day", day)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    day
      ? db
          .from("shooting_stars")
          .select("rank, stars(username, status)")
          .eq("day", day)
          .order("rank")
      : Promise.resolve({ data: [], error: null }),
    db.from("unlocks").select("day, type, params").order("id"),
  ]);

  const challengeRow = must(challenge, "challenge") as {
    day: number;
    challenge_type: string | null;
    challenge_goal: number | null;
    challenge_progress: number;
    challenge_met: boolean | null;
  } | null;
  const shootingRows = must(shooting, "shooting stars") as unknown as {
    stars: { username: string; status: string } | null;
  }[];

  return {
    day,
    totalStars: state.total_stars,
    totalConstellations: state.total_constellations,
    stage: state.stage,
    stages: STAGES,
    sun: [0, 0],
    planets: (
      must(planets, "planets") as {
        id: number;
        name: string;
        threshold: number;
        orbit_radius: number;
        unlocked_day: number | null;
      }[]
    ).map((p) => [p.id, p.name, p.threshold, Math.round(p.orbit_radius), p.unlocked_day]),
    challenge:
      challengeRow?.challenge_type && challengeRow.challenge_goal
        ? {
            day: challengeRow.day,
            type: challengeRow.challenge_type,
            goal: challengeRow.challenge_goal,
            progress: challengeRow.challenge_progress,
            met: challengeRow.challenge_met,
          }
        : null,
    shooting: shootingRows
      .filter((r) => r.stars?.status === "active")
      .map((r) => r.stars!.username),
    unlocks: must(unlocks, "unlocks") as SkyIndex["unlocks"],
    overview,
    constellations: constellations.map(indexConstellation),
  };
}

/** Keeps the last 3 indexes and the current and previous spiral images. */
async function removeOldSkyFiles(storage: PublicStorage, version: number, overviewPath: string) {
  try {
    const files = await storage.list("sky");
    const versionOf = (p: string) => Number(/\.v(\d+)\./.exec(p)?.[1] ?? NaN);
    const overviews = files
      .filter((p) => p.includes("overview.v"))
      .sort((a, b) => versionOf(b) - versionOf(a));
    const keepOverviews = new Set([overviewPath, ...overviews.slice(0, 2)]);
    const old = files.filter(
      (p) =>
        (p.includes("index.v") && versionOf(p) <= version - 3) ||
        (p.includes("overview.v") && !keepOverviews.has(p)),
    );
    await storage.remove(old);
  } catch {
    // Cleanup is best effort; leftovers are removed on the next publish.
  }
}

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Could not read ${what}: ${result.error.message}`);
  return result.data as T;
}

/** Reads every row (PostgREST returns at most 1000 per request). */
async function selectAll<T>(
  db: SupabaseClient,
  table: string,
  columns: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  refine: (query: any) => any,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await refine(db.from(table).select(columns)).range(
      from,
      from + PAGE - 1,
    );
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (data.length < PAGE) return rows;
  }
}
