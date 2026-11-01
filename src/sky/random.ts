// Seeded, reproducible randomness. Never use Math.random() for anything stored or shared:
// the same seed must always give the same sky.

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** Standard normal sample (mean 0, deviation 1). */
  gauss(): number;
  /** Shuffles the array in place (Fisher-Yates) and returns it. */
  shuffle<T>(items: T[]): T[];
}

/** 32-bit hash of any combination of numbers and strings (MurmurHash3 mixing). */
export function hashSeed(...parts: (number | string)[]): number {
  let h = 0x9e3779b9;
  for (const ch of parts.join("\u0000")) {
    h = Math.imul(h ^ ch.codePointAt(0)!, 0x85ebca6b);
    h = (h << 13) | (h >>> 19);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Mulberry32 generator. Pass several parts to get independent streams, e.g. (id, "slots"). */
export function createRng(...seed: (number | string)[]): Rng {
  let state = hashSeed(...seed);

  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (n) => Math.floor(next() * n),
    gauss: () => {
      // Box-Muller; 1 - next() avoids log(0).
      const u = 1 - next();
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items;
    },
  };
}
