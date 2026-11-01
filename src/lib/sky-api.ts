import { getPublicClient } from "../server/supabase/public";

// Browser calls to Supabase with the public key. RLS only allows these two functions.

export interface SearchResult {
  username: string;
  constellation_id: number;
  slot_index: number;
  x: number;
  y: number;
  level: number;
}

export interface StarPoint {
  username: string;
  x: number;
  y: number;
}

export interface StarDetails {
  username: string;
  constellation: number;
  slot: number;
  x: number;
  y: number;
  bornDay: number;
  days: number;
  level: number;
  invitedCount: number;
  shootingDays: number[];
  goldBorder: boolean;
  invitedBy: StarPoint | null;
  /** Up to 120 of the people this star invited, most recent first. */
  invited: StarPoint[];
}

export async function searchStars(query: string): Promise<SearchResult[]> {
  const { data, error } = await getPublicClient().rpc("search_stars", { q: query });
  if (error) throw new Error(error.message);
  return (data ?? []) as SearchResult[];
}

/** Null when there is no public star with that name. */
export async function starDetails(username: string): Promise<StarDetails | null> {
  const { data, error } = await getPublicClient().rpc("star_details", { p_username: username });
  if (error) throw new Error(error.message);
  return (data ?? null) as StarDetails | null;
}
