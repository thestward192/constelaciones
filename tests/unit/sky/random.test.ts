import { describe, expect, it } from "vitest";
import { createRng, hashSeed } from "@/sky/random";

const take = (n: number, ...seed: (number | string)[]) => {
  const rng = createRng(...seed);
  return Array.from({ length: n }, () => rng.next());
};

describe("seeded random", () => {
  it("gives the same sequence for the same seed", () => {
    expect(take(100, 42, "slots")).toEqual(take(100, 42, "slots"));
  });

  it("gives different sequences for different seeds or streams", () => {
    expect(take(10, 42)).not.toEqual(take(10, 43));
    expect(take(10, 42, "slots")).not.toEqual(take(10, 42, "placement"));
  });

  it("hashes parts without ambiguity", () => {
    expect(hashSeed(1, 23)).not.toBe(hashSeed(12, 3));
    expect(hashSeed("a")).toBe(hashSeed("a"));
  });

  it("stays in [0, 1) and is roughly uniform", () => {
    const values = take(20000, 7);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeCloseTo(0.5, 1);
  });

  it("produces normal samples with mean 0 and deviation 1", () => {
    const rng = createRng(9);
    const values = Array.from({ length: 20000 }, () => rng.gauss());
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    expect(mean).toBeCloseTo(0, 1);
    expect(sd).toBeCloseTo(1, 1);
  });

  it("shuffles reproducibly and keeps every item", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const a = createRng(5).shuffle([...items]);
    expect(createRng(5).shuffle([...items])).toEqual(a);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
    expect(a).not.toEqual(items);
  });
});
