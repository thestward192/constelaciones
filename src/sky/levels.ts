// Star levels by distinct days commenting (docs/constelaciones.md, section 3).
// Keep in sync with the SQL function star_level() in supabase/migrations.
export const LEVELS = [
  { key: "spark", name: "Chispa", minDays: 1 },
  { key: "red-dwarf", name: "Enana roja", minDays: 3 },
  { key: "yellow", name: "Estrella amarilla", minDays: 7 },
  { key: "blue-giant", name: "Gigante azul", minDays: 15 },
  { key: "supergiant", name: "Supergigante", minDays: 30 },
  { key: "nova", name: "Nova", minDays: 100 },
  { key: "supernova", name: "Supernova", minDays: 365 },
] as const;

export type Level = (typeof LEVELS)[number];

/** Level index (0 Chispa ... 6 Supernova) for a number of distinct days. */
export function levelForDays(daysCount: number): number {
  let level = 0;
  for (let i = 1; i < LEVELS.length; i++) {
    if (daysCount >= LEVELS[i].minDays) level = i;
  }
  return level;
}

/** The next level and how many days are missing, or null at the top level. */
export function nextLevel(daysCount: number): { level: Level; daysLeft: number } | null {
  const next = LEVELS[levelForDays(daysCount) + 1];
  return next ? { level: next, daysLeft: next.minDays - daysCount } : null;
}

// Invitation rewards (docs/constelaciones.md, section 4).
export const RING_THRESHOLDS = [5, 25, 100] as const;
export const SATELLITE_THRESHOLD = 100;
export const CROWN_THRESHOLD = 500;

export interface InvitationRewards {
  /** At least one light thread. */
  thread: boolean;
  /** Golden rings: 0 to 3. */
  rings: number;
  satellite: boolean;
  /** Crown of light, the maximum. */
  crown: boolean;
}

export function invitationRewards(invitedCount: number): InvitationRewards {
  return {
    thread: invitedCount >= 1,
    rings: RING_THRESHOLDS.filter((t) => invitedCount >= t).length,
    satellite: invitedCount >= SATELLITE_THRESHOLD,
    crown: invitedCount >= CROWN_THRESHOLD,
  };
}
