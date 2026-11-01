import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

// Checks the real Supabase project in .env.local: the public key must not read private
// tables nor write anything. Run after npm run db:migrate with: npm run test:remote
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!url || !anonKey || !serviceKey)("Supabase project security", () => {
  const anon = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });

  it("the service key sees the seeded data", async () => {
    const figures = await admin.from("figures").select("id", { count: "exact", head: true });
    expect(figures.error).toBeNull();
    expect(figures.count).toBeGreaterThanOrEqual(14);
    const planets = await admin.from("planets").select("name");
    expect(planets.data).toHaveLength(8);
  });

  it.each([
    "figures",
    "constellations",
    "slots",
    "stars",
    "participations",
    "comment_inbox",
    "pending_invites",
    "shooting_stars",
    "unlocks",
    "planets",
    "blocked_words",
  ])("the public key cannot read %s", async (table) => {
    const { data, error } = await anon.from(table).select("*").limit(1);
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("the public key cannot write", async () => {
    const attempts = [
      anon.from("stars").insert({ username: "intruso", born_day: 1, last_day: 1 }),
      anon.from("blocked_words").insert({ word: "intruso" }),
      anon.from("days").insert({ day: 999 }),
      anon.from("sky_state").update({ total_stars: 999 }).eq("id", true),
    ];
    for (const { error } of await Promise.all(attempts)) {
      expect(error?.code).toBe("42501");
    }
  });

  it("the public key reads sky_state and the public columns of days", async () => {
    const state = await anon.from("sky_state").select("total_stars, stage");
    expect(state.error).toBeNull();
    expect(state.data).toHaveLength(1);
    const days = await anon.from("days").select("day, challenge_type, closed");
    expect(days.error).toBeNull();
    const hidden = await anon.from("days").select("ig_media_id");
    expect(hidden.error?.code).toBe("42501");
  });

  it("the public key can search stars", async () => {
    const { data, error } = await anon.rpc("search_stars", { q: "luna" });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});
