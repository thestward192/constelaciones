// Calls to Supabase with the public key, from the browser and the server. Only these two
// functions are allowed to the public role. Plain fetch to the REST endpoint: the full
// supabase-js client would add ~70 KB of JavaScript to the public page for two calls.

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

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message ?? `${name} failed (HTTP ${response.status})`);
  return body as T;
}

export async function searchStars(query: string): Promise<SearchResult[]> {
  return (await rpc<SearchResult[] | null>("search_stars", { q: query })) ?? [];
}

/** Null when there is no public star with that name. */
export async function starDetails(username: string): Promise<StarDetails | null> {
  return (await rpc<StarDetails | null>("star_details", { p_username: username })) ?? null;
}
