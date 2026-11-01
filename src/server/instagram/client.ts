// Instagram API with Instagram Login (graph.instagram.com), only what the challenge needs: the
// account, its recent media, the comments of one video (with replies) and token renewal.
// Reference (checked October 2026): developers.facebook.com/docs/instagram-platform, API v26.0.

export const GRAPH_HOST = "https://graph.instagram.com";
export const GRAPH_VERSION = "v26.0";

export type Fetch = (url: string) => Promise<Response>;

export interface InstagramAccount {
  user_id: string;
  username: string;
}

export interface InstagramMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  timestamp?: string;
  thumbnail_url?: string;
  media_url?: string;
  comments_count?: number;
}

export interface InstagramComment {
  id: string;
  text?: string;
  timestamp?: string;
  username?: string;
  from?: { id?: string; username?: string };
  hidden?: boolean;
  /** Present on replies: the top-level comment they answer. */
  parent_id?: string;
}

export interface RefreshedToken {
  access_token: string;
  expires_in: number;
}

interface Page<T> {
  data?: T[];
  paging?: { next?: string };
}

/** An error returned by the API, kept readable for the panel. */
export class InstagramError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
  }

  /** The token expired, was revoked or is not valid (OAuthException 190). */
  get tokenInvalid(): boolean {
    return this.code === 190;
  }
}

const MEDIA_FIELDS =
  "id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url,comments_count";
// Some fields are documented only for Facebook Login; if the API rejects the list, ask for less.
const MEDIA_FIELDS_BASIC = "id,media_type,permalink,timestamp,thumbnail_url,comments_count";
const COMMENT_FIELDS = "id,text,timestamp,username,from,hidden";
const COMMENTS_PER_PAGE = 50; // the documented maximum
const MAX_PAGES = 5000; // 250,000 comments: a guard against a paging loop, never reached in practice

export class InstagramApi {
  constructor(
    private readonly token: string,
    private readonly fetcher: Fetch = (url) => fetch(url, { cache: "no-store" }),
  ) {}

  url(path: string, params: Record<string, string> = {}): string {
    const url = new URL(`${GRAPH_HOST}/${GRAPH_VERSION}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("access_token", this.token);
    return url.toString();
  }

  private async get<T>(url: string): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(url);
    } catch (error) {
      throw new InstagramError(`No se pudo conectar con Instagram: ${(error as Error).message}`);
    }
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string; code?: number };
    } | null;
    if (!response.ok || body?.error) {
      const code = body?.error?.code;
      const detail = body?.error?.message ?? `HTTP ${response.status}`;
      throw new InstagramError(
        code === 190
          ? `El token de Instagram venció o no es válido. Genera uno nuevo y pégalo en el panel. (${detail})`
          : `Instagram respondió con un error: ${detail}`,
        code,
      );
    }
    return body as T;
  }

  /** Follows `paging.next` until the end. */
  private async all<T>(first: string): Promise<T[]> {
    const items: T[] = [];
    let next: string | undefined = first;
    for (let page = 0; next && page < MAX_PAGES; page++) {
      const body: Page<T> = await this.get<Page<T>>(next);
      items.push(...(body.data ?? []));
      next = body.paging?.next;
    }
    return items;
  }

  me(): Promise<InstagramAccount> {
    return this.get<InstagramAccount>(this.url("me", { fields: "user_id,username" }));
  }

  /** The most recent media of the account, newest first. */
  async recentMedia(limit = 12): Promise<InstagramMedia[]> {
    const params = { limit: String(limit) };
    try {
      const page = await this.get<Page<InstagramMedia>>(
        this.url("me/media", { ...params, fields: MEDIA_FIELDS }),
      );
      return page.data ?? [];
    } catch (error) {
      if (!(error instanceof InstagramError) || error.code !== 100) throw error;
      const page = await this.get<Page<InstagramMedia>>(
        this.url("me/media", { ...params, fields: MEDIA_FIELDS_BASIC }),
      );
      return page.data ?? [];
    }
  }

  /**
   * Every comment of a video, replies included. The comments edge returns only top-level
   * comments (50 per page, newest first); replies come through field expansion and may have
   * their own pages.
   */
  async allComments(mediaId: string): Promise<InstagramComment[]> {
    type TopLevel = InstagramComment & { replies?: Page<InstagramComment> };
    const topLevel = await this.all<TopLevel>(
      this.url(`${encodeURIComponent(mediaId)}/comments`, {
        fields: `${COMMENT_FIELDS},replies{${COMMENT_FIELDS}}`,
        limit: String(COMMENTS_PER_PAGE),
      }),
    );
    const comments: InstagramComment[] = [];
    for (const { replies, ...comment } of topLevel) {
      comments.push(comment);
      const first = replies?.data ?? [];
      const more = replies?.paging?.next
        ? await this.all<InstagramComment>(replies.paging.next)
        : [];
      for (const reply of [...first, ...more]) comments.push({ ...reply, parent_id: comment.id });
    }
    return comments;
  }

  /** Renews a long-lived token (it must be at least 24 hours old and not expired). */
  refreshToken(): Promise<RefreshedToken> {
    const url = new URL(`${GRAPH_HOST}/refresh_access_token`);
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", this.token);
    return this.get<RefreshedToken>(url.toString());
  }
}

/** Instagram writes offsets as "+0000"; make them ISO 8601 ("+00:00"). */
export function isoTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value.replace(/([+-]\d\d)(\d\d)$/, "$1:$2"));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** The shortcode in a post link ("https://www.instagram.com/reel/ABC123/" → "ABC123"). */
export function shortcodeFromLink(value: string): string | null {
  const match = /instagram\.com\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([\w-]+)/i.exec(value);
  if (match) return match[1];
  return /^[\w-]{5,}$/.test(value) && !/^\d+$/.test(value) ? value : null;
}
