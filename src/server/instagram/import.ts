import type { SupabaseClient } from "@supabase/supabase-js";
import { extractMentions, normalizeUsername } from "../../sky";
import { ImportError, storeInboxRows, type InboxRow } from "../import";
import {
  InstagramApi,
  isoTimestamp,
  shortcodeFromLink,
  type InstagramComment,
  type InstagramMedia,
} from "./client";

export interface InstagramImportSummary {
  source: "instagram";
  day: number;
  mediaId: string;
  received: number;
  stored: number;
  /** The account's own comments and replies, hidden comments and unreadable names. */
  skipped: number;
}

/**
 * Turns API comments into inbox rows. The comment id is Instagram's own, so reading the same
 * video every hour stores each comment once. The account's own replies and hidden comments do
 * not count.
 */
export function commentsToInboxRows(
  day: number,
  comments: InstagramComment[],
  ownUsername: string | null,
): { rows: InboxRow[]; skipped: number } {
  const own = ownUsername ? normalizeUsername(ownUsername) : null;
  const rows: InboxRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const comment of comments) {
    const username = normalizeUsername(comment.from?.username ?? comment.username ?? "");
    if (!comment.id || !username || username === own || comment.hidden) {
      skipped++;
      continue;
    }
    if (seen.has(comment.id)) continue;
    seen.add(comment.id);
    rows.push({
      ig_comment_id: comment.id,
      day,
      username,
      mentions: extractMentions(comment.text ?? "", username).filter((m) => m !== own),
      commented_at: isoTimestamp(comment.timestamp) ?? new Date().toISOString(),
      source: "api",
    });
  }
  return { rows, skipped };
}

/**
 * The API id of a day's video. Days created before the connection may hold the link or the
 * shortcode instead; those are matched against the account's recent media.
 */
export function resolveMediaId(stored: string, media: InstagramMedia[]): string | null {
  if (/^\d+$/.test(stored)) return stored;
  const shortcode = shortcodeFromLink(stored);
  if (!shortcode) return null;
  const match = media.find((m) => m.permalink && shortcodeFromLink(m.permalink) === shortcode);
  return match?.id ?? null;
}

/** Reads every comment of the day's video and stores the new ones in comment_inbox. */
export async function importDayFromInstagram(
  db: SupabaseClient,
  api: InstagramApi,
  day: number,
  ownUsername: string | null,
): Promise<InstagramImportSummary> {
  const { data: row, error } = await db
    .from("days")
    .select("day, ig_media_id, closed")
    .eq("day", day)
    .maybeSingle();
  if (error) throw new Error(`Could not read day ${day}: ${error.message}`);
  if (!row) throw new ImportError(`El día ${day} no existe.`);
  if (row.closed)
    throw new ImportError(`El día ${day} está cerrado. Ábrelo de nuevo para importar.`);
  if (!row.ig_media_id) throw new ImportError(`El día ${day} no tiene un video asociado.`);

  let mediaId = resolveMediaId(row.ig_media_id, []);
  if (!mediaId) {
    mediaId = resolveMediaId(row.ig_media_id, await api.recentMedia(50));
    if (!mediaId) {
      throw new ImportError(
        `No encontré el video del día ${day} entre los últimos de la cuenta. Elígelo de la lista en la página Instagram del panel.`,
      );
    }
    // Keep the API id so the next run does not need to look it up again.
    await db.from("days").update({ ig_media_id: mediaId }).eq("day", day);
  }

  const comments = await api.allComments(mediaId);
  const { rows, skipped } = commentsToInboxRows(day, comments, ownUsername);
  const stored = await storeInboxRows(db, rows);
  return { source: "instagram", day, mediaId, received: comments.length, stored, skipped };
}
