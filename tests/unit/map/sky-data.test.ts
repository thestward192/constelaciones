import { describe, expect, it } from "vitest";
import {
  buildSkyData,
  ConstellationCache,
  loadSkyData,
  type ConstellationInfo,
} from "@/map/sky-data";
import type { SkyIndex } from "@/sky/public-files";
import { constellationPlacement } from "@/sky/geometry";

function fakeIndex(count: number): SkyIndex {
  return {
    v: 3,
    generatedAt: "",
    day: 10,
    totalStars: count * 300,
    totalConstellations: count,
    stage: 1,
    stages: [],
    sun: [0, 0],
    planets: [[1, "Mercurio", 1000, 730, 4]],
    challenge: null,
    shooting: [],
    unlocks: [],
    overview: null,
    constellations: Array.from({ length: count }, (_, i) => {
      const p = constellationPlacement(i + 1);
      return [
        i + 1,
        Math.round(p.x),
        Math.round(p.y),
        Math.round(p.scale),
        `C${i + 1}`,
        1,
        2,
        3,
        300,
      ];
    }),
  };
}

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)));

describe("sky data", () => {
  it("loads latest.json, then the index it points to", async () => {
    const urls: string[] = [];
    const data = await loadSkyData("https://cdn/files", (url) => {
      urls.push(url);
      return url.endsWith("latest.json")
        ? json({ index: "sky/index.v3.json" })
        : json(fakeIndex(5));
    });
    expect(urls).toEqual([
      "https://cdn/files/sky/latest.json",
      "https://cdn/files/sky/index.v3.json",
    ]);
    expect(data.constellations).toHaveLength(5);
    expect(data.byId.get(2)).toMatchObject({ id: 2, name: "C2", complete: true, version: 2 });
  });

  it("finds exactly the constellations touching a rectangle", () => {
    const data = buildSkyData("", fakeIndex(500));
    const rect = { x0: -2000, y0: -1500, x1: 1000, y1: 800 };
    const brute = data.constellations.filter(
      (c) =>
        c.x + c.r >= rect.x0 &&
        c.x - c.r <= rect.x1 &&
        c.y + c.r >= rect.y0 &&
        c.y - c.r <= rect.y1,
    );
    expect(
      data.grid
        .query(rect)
        .map((c) => c.id)
        .sort((a, b) => a - b),
    ).toEqual(brute.map((c) => c.id));
  });

  it("knows how far the sky reaches", () => {
    const data = buildSkyData("", fakeIndex(100));
    const farthest = Math.max(...data.constellations.map((c) => Math.hypot(c.x, c.y) + c.r));
    expect(data.radius).toBe(farthest);
  });
});

describe("constellation cache", () => {
  const infos: ConstellationInfo[] = buildSkyData("", fakeIndex(20)).constellations;

  function setup(limit: number) {
    const requested: string[] = [];
    const evicted: number[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const cache = new ConstellationCache("https://cdn", {
      limit,
      concurrency: 3,
      fetchImpl: async (url) => {
        requested.push(url);
        await gate;
        const id = Number(/c\/(\d+)\./.exec(url)![1]);
        return new Response(JSON.stringify({ id, v: 2, stars: [] }));
      },
      onEvict: (id) => evicted.push(id),
    });
    return { cache, requested, evicted, release: () => release() };
  }

  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("downloads only versioned files, a few at a time", async () => {
    const { cache, requested, release } = setup(100);
    cache.want(infos.slice(0, 5), { x: 0, y: 0 });
    expect(requested).toEqual([
      "https://cdn/c/1.v2.json",
      "https://cdn/c/2.v2.json",
      "https://cdn/c/3.v2.json",
    ]);
    release();
    for (let i = 0; i < 5; i++) await flush();
    expect(requested).toHaveLength(5);
    expect(cache.size).toBe(5);
    cache.want(infos.slice(0, 5), { x: 0, y: 0 });
    expect(requested).toHaveLength(5); // nothing downloaded twice
  });

  it("drops the farthest files it no longer needs when over the limit", async () => {
    const { cache, evicted, release } = setup(4);
    release();
    cache.want(infos.slice(0, 6), { x: 0, y: 0 });
    for (let i = 0; i < 6; i++) await flush();
    expect(cache.size).toBe(6); // all wanted: none dropped
    const near = infos[0];
    cache.want([near], { x: near.x, y: near.y });
    expect(cache.size).toBe(4);
    expect(evicted).not.toContain(near.id);
    const kept = infos.slice(0, 6).filter((c) => !evicted.includes(c.id));
    const dropped = infos.slice(0, 6).filter((c) => evicted.includes(c.id));
    const dist = (c: ConstellationInfo) => Math.hypot(c.x - near.x, c.y - near.y);
    expect(Math.max(...kept.map(dist))).toBeLessThanOrEqual(Math.min(...dropped.map(dist)));
  });
});
