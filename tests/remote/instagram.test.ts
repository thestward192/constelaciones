import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Fetch } from "@/server/instagram/client";
import { runHourly } from "@/server/instagram/hourly";

// The whole hourly job against the real Supabase project, with Instagram replaced by a fake:
// the comments of a new test day must end up as stars. Skipped once a real token is stored, so
// it never touches the owner's connection.

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

describe("hourly job", () => {
  it("imports a video's comments, processes and publishes them", { timeout: 240_000 }, async () => {
    const { data: existing } = await db.from("instagram_auth").select("id").maybeSingle();
    if (existing || process.env.IG_ACCESS_TOKEN) {
      console.warn("Instagram is connected: skipping the fake hourly run.");
      return;
    }

    const stamp = Date.now().toString(36).slice(-6);
    const names = ["a", "b"].map((s) => `prueba_ig_${stamp}_${s}`);
    const mediaId = `9${Date.now()}`;
    const { data: last } = await db
      .from("days")
      .select("day")
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle();
    const day = (last?.day ?? 0) + 1;
    await db
      .from("days")
      .insert({ day, ig_media_id: mediaId, published_at: new Date().toISOString() });
    await db.from("instagram_auth").insert({ access_token: "fake-token", username: "reto_prueba" });

    const fetcher: Fetch = async (raw) => {
      const url = new URL(raw);
      expect(url.searchParams.get("access_token")).toBe("fake-token");
      if (url.pathname.endsWith(`/${mediaId}/comments`)) {
        return Response.json({
          data: [
            {
              id: `${mediaId}1`,
              username: names[0],
              text: `vengan @${names[1]}`,
              timestamp: "2026-11-04T18:30:05+0000",
              replies: {
                data: [
                  { id: `${mediaId}2`, username: names[1], timestamp: "2026-11-04T18:31:00+0000" },
                  { id: `${mediaId}3`, username: "reto_prueba", text: "gracias" },
                ],
              },
            },
          ],
        });
      }
      return Response.json({ error: { message: "unexpected" } }, { status: 404 });
    };

    try {
      const summary = await runHourly(db, fetcher);
      expect(summary.token).toBe("not-due");
      const mine = summary.imports.find((i) => i.day === day);
      expect(mine).toMatchObject({ received: 3, stored: 2, skipped: 1 });
      expect(summary.processed.busy).toBeFalsy();

      const { data: stars } = await db
        .from("stars")
        .select("username, invited_by, born_day")
        .in("username", names)
        .order("username");
      expect(stars).toHaveLength(2);
      expect(stars!.every((s) => s.born_day === day)).toBe(true);
      expect(stars![1].invited_by).not.toBeNull();

      // A second run finds nothing new.
      const again = await runHourly(db, fetcher);
      expect(again.imports.find((i) => i.day === day)).toMatchObject({ stored: 0 });
    } finally {
      await db.from("instagram_auth").delete().eq("id", 1);
      await db.from("days").update({ closed: true }).eq("day", day);
    }
  });
});
