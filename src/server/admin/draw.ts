import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Picks `count` different winners uniformly at random (partial Fisher-Yates). The random source
 * is cryptographic by default, so nobody can predict or steer the draw.
 */
export function pickWinners<T>(
  candidates: T[],
  count: number,
  random: (n: number) => number = randomInt,
): T[] {
  const pool = [...candidates];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + random(pool.length - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

export class DrawError extends Error {}

/** Draws the shooting stars of a day and stores them (once: the database refuses a repeat). */
export async function drawShootingStars(db: SupabaseClient, day: number, count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 200) {
    throw new DrawError("Elige entre 1 y 200 estrellas fugaces.");
  }
  const { data, error } = await db.rpc("shooting_candidates", { p_day: day });
  if (error) throw new Error(error.message);
  const candidates = (data ?? []) as number[];
  if (!candidates.length)
    throw new DrawError("Ese día todavía no tiene participaciones procesadas.");

  const winners = pickWinners(candidates, count);
  const { error: recordError } = await db.rpc("record_shooting_draw", {
    p_day: day,
    p_star_ids: winners,
  });
  if (recordError) {
    if (/already drawn/.test(recordError.message))
      throw new DrawError("El sorteo de ese día ya se hizo y no se puede repetir.");
    throw new Error(recordError.message);
  }
  return { winners: winners.length, candidates: candidates.length };
}
