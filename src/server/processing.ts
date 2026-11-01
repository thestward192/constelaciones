import type { SupabaseClient } from "@supabase/supabase-js";
import {
  constellationPlacement,
  figureForConstellation,
  generateSlots,
  STARS_PER_CONSTELLATION,
  type Figure,
  type Slot,
} from "../sky";

export type StoredFigure = Figure & { id: number };

export interface BatchResult {
  busy?: boolean;
  needs_capacity?: number;
  processed?: number;
  new_stars?: number;
  review_stars?: number;
  participations?: number;
  invites_resolved?: number;
  constellations_completed?: number;
  pending?: number;
}

export interface OpenConstellation {
  p_id: number;
  p_figure_id: number;
  p_name: string;
  p_center_x: number;
  p_center_y: number;
  p_scale: number;
  p_rotation: number;
  p_slots: Slot[];
}

/** The database operations processing needs. Supabase in production, PGlite in tests. */
export interface ProcessingStore {
  processBatch(limit: number): Promise<BatchResult>;
  countUnfinishedConstellations(): Promise<number>;
  lastConstellationId(): Promise<number>;
  loadFigures(): Promise<StoredFigure[]>;
  openConstellation(args: OpenConstellation): Promise<void>;
}

export interface ProcessSummary {
  processed: number;
  newStars: number;
  reviewStars: number;
  participations: number;
  invitesResolved: number;
  constellationsCompleted: number;
  constellationsOpened: number;
  pending: number;
  batches: number;
  busy: boolean;
}

/** Comments per database call. Each call must finish within Supabase's 8 s API limit. */
export const BATCH_SIZE = 4000;
const MAX_CALLS = 500;

/**
 * Processes every pending comment: calls process_inbox() in batches and opens new
 * constellations (with their slots from the sky engine) whenever more room is needed.
 * Safe to call again at any time: nothing is ever duplicated.
 */
export async function processInbox(
  store: ProcessingStore,
  batchSize = BATCH_SIZE,
): Promise<ProcessSummary> {
  const summary: ProcessSummary = {
    processed: 0,
    newStars: 0,
    reviewStars: 0,
    participations: 0,
    invitesResolved: 0,
    constellationsCompleted: 0,
    constellationsOpened: 0,
    pending: 0,
    batches: 0,
    busy: false,
  };

  // There is always a constellation forming, even before the first star.
  summary.constellationsOpened += await ensureCapacity(store, 0);

  for (let i = 0; i < MAX_CALLS; i++) {
    const result = await store.processBatch(batchSize);
    if (result.busy) {
      summary.busy = true;
      break;
    }
    if (result.needs_capacity) {
      summary.constellationsOpened += await ensureCapacity(store, result.needs_capacity);
      continue;
    }

    summary.batches++;
    summary.processed += result.processed ?? 0;
    summary.newStars += result.new_stars ?? 0;
    summary.reviewStars += result.review_stars ?? 0;
    summary.participations += result.participations ?? 0;
    summary.invitesResolved += result.invites_resolved ?? 0;
    summary.constellationsCompleted += result.constellations_completed ?? 0;
    summary.pending = result.pending ?? 0;
    if (!result.processed || !summary.pending) break;
  }

  // The last batch may have completed the last open constellation exactly.
  if (!summary.busy) summary.constellationsOpened += await ensureCapacity(store, 0);
  return summary;
}

/**
 * Opens enough reserved constellations to add `extraSlots` free slots, and always keeps at
 * least one constellation that is not complete. Returns how many were opened.
 */
export async function ensureCapacity(store: ProcessingStore, extraSlots: number): Promise<number> {
  let toOpen = Math.ceil(extraSlots / STARS_PER_CONSTELLATION);
  if ((await store.countUnfinishedConstellations()) === 0) toOpen = Math.max(toOpen, 1);
  if (toOpen === 0) return 0;

  const figures = await store.loadFigures();
  let id = await store.lastConstellationId();
  for (let n = 0; n < toOpen; n++) {
    id++;
    const { figure } = figureForConstellation(id, figures);
    const placement = constellationPlacement(id);
    await store.openConstellation({
      p_id: id,
      p_figure_id: figure.id,
      p_name: figure.name,
      p_center_x: placement.x,
      p_center_y: placement.y,
      p_scale: placement.scale,
      p_rotation: placement.rotation,
      p_slots: generateSlots(figure, placement, id),
    });
  }
  return toOpen;
}

/** ProcessingStore backed by Supabase (service role client). */
export function supabaseStore(db: SupabaseClient): ProcessingStore {
  return {
    async processBatch(limit) {
      const { data, error } = await db.rpc("process_inbox", { p_limit: limit });
      if (error) throw new Error(`process_inbox failed: ${error.message}`);
      return data as BatchResult;
    },
    async countUnfinishedConstellations() {
      const { count, error } = await db
        .from("constellations")
        .select("id", { count: "exact", head: true })
        .neq("status", "complete");
      if (error) throw new Error(`Could not read constellations: ${error.message}`);
      return count ?? 0;
    },
    async lastConstellationId() {
      const { data, error } = await db
        .from("constellations")
        .select("id")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Could not read constellations: ${error.message}`);
      return data?.id ?? 0;
    },
    async loadFigures() {
      const { data, error } = await db
        .from("figures")
        .select("id, slug, name, anchors, edges, handmade")
        .order("id");
      if (error || !data?.length) {
        throw new Error(`Could not read figures: ${error?.message ?? "none found"}`);
      }
      return data as StoredFigure[];
    },
    async openConstellation(args) {
      const { error } = await db.rpc("open_constellation", args);
      if (error) throw new Error(`open_constellation(${args.p_id}) failed: ${error.message}`);
    },
  };
}
