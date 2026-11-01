import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { InstagramApi, InstagramError, type Fetch } from "./client";

// The long-lived token lasts 60 days and every renewal gives 60 more. The hourly job renews it
// once a week, so a few failed weeks in a row still leave time to notice the warning in the panel.

const DAY = 24 * 60 * 60 * 1000;
export const TOKEN_LIFETIME_DAYS = 60;
const REFRESH_EVERY_DAYS = 7;
/** The panel warns when the token has fewer days than this left. */
export const WARN_DAYS = 14;

export interface StoredToken {
  access_token: string;
  env_fingerprint: string | null;
  connected_at: string;
  refreshed_at: string | null;
  expires_at: string | null;
  user_id: string | null;
  username: string | null;
  last_error: string | null;
  last_error_at: string | null;
}

/** What the panel shows (never the token itself). */
export type TokenStatus = Omit<StoredToken, "access_token" | "env_fingerprint"> & {
  /** Known expiry, or an estimate from the last renewal. */
  expiresAt: string;
  daysLeft: number;
  warning: string | null;
};

const fingerprint = (token: string) =>
  createHash("sha256").update(token).digest("hex").slice(0, 16);

/**
 * The token to use. A new IG_ACCESS_TOKEN in the environment replaces the stored one; otherwise
 * the stored (renewed) token wins, so renewals survive redeploys.
 */
export async function getInstagramToken(
  db: SupabaseClient,
  envToken = process.env.IG_ACCESS_TOKEN?.trim(),
): Promise<StoredToken | null> {
  const { data, error } = await db.from("instagram_auth").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(`Could not read the Instagram token: ${error.message}`);
  const stored = data as StoredToken | null;
  if (envToken && stored?.env_fingerprint !== fingerprint(envToken)) {
    return saveToken(db, envToken, { env_fingerprint: fingerprint(envToken) });
  }
  return stored;
}

/** Stores a token pasted by the owner (or found in the environment) as the current one. */
export async function saveToken(
  db: SupabaseClient,
  token: string,
  extra: Partial<StoredToken> = {},
): Promise<StoredToken> {
  const row = {
    id: 1,
    access_token: token,
    connected_at: new Date().toISOString(),
    refreshed_at: null,
    expires_at: null,
    last_error: null,
    last_error_at: null,
    ...extra,
  };
  const { data, error } = await db.from("instagram_auth").upsert(row).select("*").single();
  if (error) throw new Error(`Could not store the Instagram token: ${error.message}`);
  return data as StoredToken;
}

export function refreshDue(token: StoredToken, now = new Date()): boolean {
  const since = now.getTime() - new Date(token.refreshed_at ?? token.connected_at).getTime();
  return since >= REFRESH_EVERY_DAYS * DAY;
}

export type RefreshResult = "renewed" | "not-due" | "failed";

/** Renews the token when it is due. A failure is recorded for the panel and does not throw. */
export async function refreshIfDue(
  db: SupabaseClient,
  token: StoredToken,
  fetcher?: Fetch,
  now = new Date(),
): Promise<{ result: RefreshResult; token: StoredToken; error?: string }> {
  if (!refreshDue(token, now)) return { result: "not-due", token };
  try {
    const renewed = await new InstagramApi(token.access_token, fetcher).refreshToken();
    const update = {
      access_token: renewed.access_token,
      refreshed_at: now.toISOString(),
      expires_at: new Date(now.getTime() + renewed.expires_in * 1000).toISOString(),
      last_error: null,
      last_error_at: null,
    };
    const { error } = await db.from("instagram_auth").update(update).eq("id", 1);
    if (error) throw new Error(`Could not store the renewed token: ${error.message}`);
    return { result: "renewed", token: { ...token, ...update } };
  } catch (error) {
    const message =
      error instanceof InstagramError
        ? error.message
        : `No se pudo renovar el token: ${(error as Error).message}`;
    await db
      .from("instagram_auth")
      .update({ last_error: message, last_error_at: now.toISOString() })
      .eq("id", 1);
    return {
      result: "failed",
      token: { ...token, last_error: message, last_error_at: now.toISOString() },
      error: message,
    };
  }
}

/** Records a problem seen while using the token (shown in the panel until the next renewal). */
export async function recordTokenError(db: SupabaseClient, message: string): Promise<void> {
  await db
    .from("instagram_auth")
    .update({ last_error: message, last_error_at: new Date().toISOString() })
    .eq("id", 1);
}

export function tokenStatus(token: StoredToken, now = new Date()): TokenStatus {
  const visible = {
    connected_at: token.connected_at,
    refreshed_at: token.refreshed_at,
    expires_at: token.expires_at,
    user_id: token.user_id,
    username: token.username,
    last_error: token.last_error,
    last_error_at: token.last_error_at,
  };
  const expiresAt =
    token.expires_at ??
    new Date(
      new Date(token.refreshed_at ?? token.connected_at).getTime() + TOKEN_LIFETIME_DAYS * DAY,
    ).toISOString();
  const daysLeft = Math.floor((new Date(expiresAt).getTime() - now.getTime()) / DAY);
  let warning: string | null = null;
  if (daysLeft < 0) {
    warning = "El token de Instagram venció. Genera uno nuevo y pégalo aquí.";
  } else if (daysLeft < WARN_DAYS) {
    warning = `El token de Instagram vence en ${daysLeft} ${daysLeft === 1 ? "día" : "días"} y no se ha podido renovar. Genera uno nuevo y pégalo aquí.`;
  } else if (token.last_error) {
    warning = token.last_error;
  }
  return { ...visible, expiresAt, daysLeft, warning };
}
