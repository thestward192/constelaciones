import type { IncomingComment } from "../import";

/**
 * Reads a pasted list or a CSV of comments. Each line is a username, optionally followed by
 * the comment (separated by a comma, semicolon, tab or colon), e.g.:
 *
 *   @ana
 *   leo: miren esto @pau
 *   usuario,comentario   ← a header like this is skipped
 *
 * Quotes around CSV fields are removed. Empty lines are ignored.
 */
export function parseCommentList(text: string): IncomingComment[] {
  const comments: IncomingComment[] = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const match = /^("?)([^,;\t:"]*)\1\s*(?:[,;\t:]\s*(.*))?$/.exec(line);
    const username = (match ? match[2] : line).trim();
    const rest = match?.[3]?.trim() ?? "";
    if (i === 0 && /^(usuario|username|user|nombre)$/i.test(username)) return; // header
    const text = rest.replace(/^"([\s\S]*)"$/, "$1").replace(/""/g, '"');
    comments.push(text ? { username, text } : { username });
  });
  return comments;
}
