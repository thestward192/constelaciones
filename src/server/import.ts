import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractMentions, normalizeUsername } from "../sky";

export interface IncomingComment {
  username: string;
  /** Comment text. Only used to find @mentions; it is never stored. */
  text?: string;
}

export interface ImportSummary {
  received: number;
  stored: number;
  invalid: string[];
}

export interface InboxRow {
  ig_comment_id: string;
  day: number;
  username: string;
  mentions: string[];
  commented_at: string;
  source: "manual";
}

const MAX_COMMENTS = 50_000;
const CHUNK = 1000;

/**
 * Turns a manually pasted list into inbox rows. The id is derived from the content, so importing
 * the same list twice stores nothing new. List order is kept as the comment time.
 */
export function toInboxRows(
  day: number,
  comments: IncomingComment[],
  receivedAt = new Date(),
): { rows: InboxRow[]; invalid: string[] } {
  const rows: InboxRow[] = [];
  const invalid: string[] = [];
  comments.forEach((comment, i) => {
    const username = normalizeUsername(comment.username ?? "");
    if (!username) {
      invalid.push(String(comment.username ?? ""));
      return;
    }
    const text = comment.text ?? "";
    const hash = createHash("sha256").update(`${username}\n${text}`).digest("hex").slice(0, 24);
    rows.push({
      ig_comment_id: `manual:${day}:${hash}`,
      day,
      username,
      mentions: extractMentions(text, username),
      commented_at: new Date(receivedAt.getTime() + i).toISOString(),
      source: "manual",
    });
  });
  return { rows, invalid };
}

/** Stores a manual list of comments for a day in comment_inbox (creating the day if needed). */
export async function importComments(
  db: SupabaseClient,
  day: number,
  comments: IncomingComment[],
): Promise<ImportSummary> {
  if (!Number.isInteger(day) || day < 1)
    throw new ImportError("El día debe ser un número entero desde 1.");
  if (!Array.isArray(comments)) throw new ImportError("Falta la lista de comentarios.");
  if (comments.length > MAX_COMMENTS) {
    throw new ImportError(`Máximo ${MAX_COMMENTS} comentarios por importación.`);
  }

  const { rows, invalid } = toInboxRows(day, comments);

  const { error: dayError } = await db.from("days").upsert({ day }, { ignoreDuplicates: true });
  if (dayError) throw new Error(`Could not create day ${day}: ${dayError.message}`);

  let stored = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { data, error } = await db
      .from("comment_inbox")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "ig_comment_id", ignoreDuplicates: true })
      .select("ig_comment_id");
    if (error) throw new Error(`Could not store comments: ${error.message}`);
    stored += data.length;
  }
  return { received: comments.length, stored, invalid };
}

/** A problem with the request itself (shown to whoever sent it). */
export class ImportError extends Error {}
