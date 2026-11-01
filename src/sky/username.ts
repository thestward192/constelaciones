// Instagram usernames: letters, numbers, periods and underscores, at most 30 characters.
const VALID_USERNAME = /^[a-z0-9._]{1,30}$/;
const MENTION = /(?<![\w.@])@([A-Za-z0-9._]{1,30})/g;

/**
 * Normalized username, the unique key of a star: lowercase, without @ and without spaces.
 * Returns null when what is left is not a valid Instagram username.
 */
export function normalizeUsername(raw: string): string | null {
  const name = raw.normalize("NFKC").toLowerCase().replace(/\s+/g, "").replace(/^@+/, "");
  return VALID_USERNAME.test(name) ? name : null;
}

/**
 * @mentions in a comment, normalized, without duplicates, in order of appearance.
 * Emails (ana@mail.com) are not mentions. The author's own name can be excluded.
 */
export function extractMentions(text: string, author?: string): string[] {
  const self = author ? normalizeUsername(author) : null;
  const found = new Set<string>();
  for (const match of text.matchAll(MENTION)) {
    // A trailing period is punctuation ("gracias @ana."), not part of the name.
    const name = normalizeUsername(match[1].replace(/\.+$/, ""));
    if (name && name !== self) found.add(name);
  }
  return [...found];
}
