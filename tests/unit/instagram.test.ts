import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  InstagramApi,
  InstagramError,
  isoTimestamp,
  shortcodeFromLink,
  type Fetch,
} from "@/server/instagram/client";
import { commentsToInboxRows, resolveMediaId } from "@/server/instagram/import";
import {
  getInstagramToken,
  refreshDue,
  refreshIfDue,
  tokenStatus,
  type StoredToken,
} from "@/server/instagram/token";

const DAY = 24 * 60 * 60 * 1000;

/** A fake Graph API: maps "path?key=value" fragments to responses and records every call. */
function fakeApi(routes: Record<string, unknown>, status: Record<string, number> = {}) {
  const calls: URL[] = [];
  const fetcher: Fetch = async (raw) => {
    const url = new URL(raw);
    calls.push(url);
    const key = Object.keys(routes).find((k) => {
      const [path, query] = k.split("?");
      if (!url.pathname.endsWith(path)) return false;
      return !query || query.split("&").every((pair) => url.search.includes(pair));
    });
    if (!key)
      return new Response(JSON.stringify({ error: { message: "not found" } }), { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: status[key] ?? 200 });
  };
  return { fetcher, calls };
}

describe("InstagramApi", () => {
  it("reads every page of comments and their replies", async () => {
    const next = "https://graph.instagram.com/v26.0/123/comments?after=p2&access_token=t";
    const moreReplies = "https://graph.instagram.com/v26.0/c1/replies?after=r2&access_token=t";
    const { fetcher, calls } = fakeApi({
      "/123/comments?after=p2": { data: [{ id: "c3", username: "leo" }] },
      "/123/comments": {
        data: [
          {
            id: "c1",
            username: "ana",
            text: "hola @pau",
            replies: { data: [{ id: "r1", username: "pau" }], paging: { next: moreReplies } },
          },
          { id: "c2", username: "mia" },
        ],
        paging: { next },
      },
      "/c1/replies?after=r2": { data: [{ id: "r2", username: "teo" }] },
    });
    const comments = await new InstagramApi("t", fetcher).allComments("123");
    expect(comments.map((c) => c.id)).toEqual(["c1", "r1", "r2", "c2", "c3"]);
    expect(comments.find((c) => c.id === "r2")?.parent_id).toBe("c1");
    expect(calls[0].pathname).toBe("/v26.0/123/comments");
    expect(calls[0].searchParams.get("limit")).toBe("50");
    expect(calls[0].searchParams.get("fields")).toContain("replies{");
    expect(calls).toHaveLength(3);
  });

  it("explains an expired token in Spanish", async () => {
    const { fetcher } = fakeApi(
      { "/me": { error: { message: "Error validating access token", code: 190 } } },
      { "/me": 400 },
    );
    const error = await new InstagramApi("t", fetcher).me().catch((e) => e);
    expect(error).toBeInstanceOf(InstagramError);
    expect(error.tokenInvalid).toBe(true);
    expect(error.message).toMatch(/venció o no es válido/);
  });

  it("asks for fewer media fields when the API rejects some", async () => {
    let first = true;
    const fetcher: Fetch = async (raw) => {
      const fields = new URL(raw).searchParams.get("fields") ?? "";
      if (first) {
        first = false;
        expect(fields).toContain("caption");
        return new Response(
          JSON.stringify({ error: { message: "nonexisting field", code: 100 } }),
          {
            status: 400,
          },
        );
      }
      expect(fields).not.toContain("caption");
      return new Response(JSON.stringify({ data: [{ id: "1" }] }));
    };
    expect(await new InstagramApi("t", fetcher).recentMedia()).toEqual([{ id: "1" }]);
  });

  it("refreshes with the documented endpoint", async () => {
    const { fetcher, calls } = fakeApi({
      "/refresh_access_token": { access_token: "new", token_type: "bearer", expires_in: 5184000 },
    });
    expect(await new InstagramApi("old", fetcher).refreshToken()).toMatchObject({
      access_token: "new",
    });
    expect(calls[0].pathname).toBe("/refresh_access_token");
    expect(calls[0].searchParams.get("grant_type")).toBe("ig_refresh_token");
    expect(calls[0].searchParams.get("access_token")).toBe("old");
  });

  it("turns network failures into a readable error", async () => {
    const fetcher: Fetch = async () => {
      throw new Error("ECONNRESET");
    };
    await expect(new InstagramApi("t", fetcher).me()).rejects.toThrow(/No se pudo conectar/);
  });
});

describe("comment helpers", () => {
  it("normalizes Instagram timestamps", () => {
    expect(isoTimestamp("2026-11-04T18:30:05+0000")).toBe("2026-11-04T18:30:05.000Z");
    expect(isoTimestamp("2026-11-04T12:30:05-0600")).toBe("2026-11-04T18:30:05.000Z");
    expect(isoTimestamp(undefined)).toBeNull();
    expect(isoTimestamp("ayer")).toBeNull();
  });

  it("finds the shortcode in links", () => {
    expect(shortcodeFromLink("https://www.instagram.com/reel/DAbc_12-x/?igsh=1")).toBe("DAbc_12-x");
    expect(shortcodeFromLink("https://instagram.com/p/XYZ123/")).toBe("XYZ123");
    expect(shortcodeFromLink("https://www.instagram.com/cuenta/reel/XYZ123")).toBe("XYZ123");
    expect(shortcodeFromLink("XYZ123")).toBe("XYZ123");
    expect(shortcodeFromLink("17895695668004550")).toBeNull();
  });

  it("resolves a day's video from an id, a link or a shortcode", () => {
    const media = [{ id: "111", permalink: "https://www.instagram.com/reel/ABC123/" }];
    expect(resolveMediaId("999", media)).toBe("999");
    expect(resolveMediaId("https://www.instagram.com/reel/ABC123/?x=1", media)).toBe("111");
    expect(resolveMediaId("ABC123", media)).toBe("111");
    expect(resolveMediaId("https://www.instagram.com/reel/OTRO99/", media)).toBeNull();
  });

  it("keeps commenters and their mentions, skipping the account itself and hidden comments", () => {
    const { rows, skipped } = commentsToInboxRows(
      4,
      [
        {
          id: "1",
          from: { username: "Ana" },
          text: "vengan @leo @reto.oficial",
          timestamp: "2026-11-04T18:30:05+0000",
        },
        { id: "2", username: "reto.oficial", text: "gracias @ana" },
        { id: "3", username: "oculto", hidden: true },
        { id: "4", username: "no válido!" },
        { id: "1", from: { username: "ana" } },
      ],
      "Reto.Oficial",
    );
    expect(rows).toEqual([
      {
        ig_comment_id: "1",
        day: 4,
        username: "ana",
        mentions: ["leo"],
        commented_at: "2026-11-04T18:30:05.000Z",
        source: "api",
      },
    ]);
    expect(skipped).toBe(3);
  });
});

/** Just enough of the Supabase client for the instagram_auth row. */
function fakeDb(initial: StoredToken | null) {
  let row: (StoredToken & { id: number }) | null = initial ? { id: 1, ...initial } : null;
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
      upsert: (value: StoredToken & { id: number }) => {
        row = { ...value };
        return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
      },
      update: (value: Partial<StoredToken>) => ({
        eq: async () => {
          if (row) row = { ...row, ...value };
          return { error: null };
        },
      }),
    }),
  };
  return { db: db as unknown as SupabaseClient, row: () => row };
}

const token = (over: Partial<StoredToken> = {}): StoredToken => ({
  access_token: "old",
  env_fingerprint: null,
  connected_at: "2026-11-01T00:00:00.000Z",
  refreshed_at: null,
  expires_at: null,
  user_id: "1",
  username: "reto",
  last_error: null,
  last_error_at: null,
  ...over,
});

describe("token", () => {
  it("is renewed once a week", () => {
    const now = new Date("2026-11-08T00:00:00Z");
    expect(refreshDue(token(), now)).toBe(true);
    expect(refreshDue(token({ connected_at: "2026-11-02T00:00:00Z" }), now)).toBe(false);
    expect(refreshDue(token({ refreshed_at: "2026-11-07T00:00:00Z" }), now)).toBe(false);
  });

  it("stores the renewed token and its expiry", async () => {
    const { db, row } = fakeDb(token());
    const { fetcher } = fakeApi({
      "/refresh_access_token": {
        access_token: "new",
        token_type: "bearer",
        expires_in: 60 * 86400,
      },
    });
    const now = new Date("2026-11-10T00:00:00Z");
    const result = await refreshIfDue(db, token(), fetcher, now);
    expect(result.result).toBe("renewed");
    expect(row()).toMatchObject({
      access_token: "new",
      refreshed_at: "2026-11-10T00:00:00.000Z",
      expires_at: "2027-01-09T00:00:00.000Z",
    });
  });

  it("records a failed renewal for the panel without throwing", async () => {
    const { db, row } = fakeDb(token());
    const { fetcher } = fakeApi(
      { "/refresh_access_token": { error: { message: "expired", code: 190 } } },
      { "/refresh_access_token": 400 },
    );
    const result = await refreshIfDue(db, token(), fetcher, new Date("2026-11-10T00:00:00Z"));
    expect(result.result).toBe("failed");
    expect(row()?.access_token).toBe("old");
    expect(row()?.last_error).toMatch(/venció/);
  });

  it("takes a new token from the environment, but keeps renewals otherwise", async () => {
    const { db, row } = fakeDb(null);
    const first = await getInstagramToken(db, "token-del-entorno");
    expect(first?.access_token).toBe("token-del-entorno");
    // The job renews it; the same environment value must not undo the renewal.
    await db.from("instagram_auth").update({ access_token: "renovado" }).eq("id", 1);
    expect((await getInstagramToken(db, "token-del-entorno"))?.access_token).toBe("renovado");
    // A different value in the environment replaces it.
    expect((await getInstagramToken(db, "otro-token"))?.access_token).toBe("otro-token");
    expect(row()?.refreshed_at).toBeNull();
  });

  it("warns when it is about to expire or a renewal failed", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    expect(tokenStatus(token({ connected_at: "2026-11-09T00:00:00Z" }), now).warning).toBeNull();
    const close = tokenStatus(
      token({ expires_at: new Date(now.getTime() + 5 * DAY).toISOString() }),
      now,
    );
    expect(close.daysLeft).toBe(5);
    expect(close.warning).toMatch(/vence en 5 días/);
    expect(tokenStatus(token({ expires_at: "2026-11-01T00:00:00Z" }), now).warning).toMatch(
      /venció/,
    );
    expect(
      tokenStatus(token({ connected_at: "2026-11-09T00:00:00Z", last_error: "falló" }), now)
        .warning,
    ).toBe("falló");
    expect(JSON.stringify(tokenStatus(token(), now))).not.toContain("old");
  });
});
