import { CONSTELLATION_RADIUS } from "../sky/geometry";
import { paths, type ConstellationFile, type SkyIndex } from "../sky/public-files";
import type { WorldRect } from "./camera";

// The page never downloads the whole sky: a light index first, then only the files of the
// constellations on screen (docs/constelaciones-implementacion.md, section 1).

export interface ConstellationInfo {
  id: number;
  x: number;
  y: number;
  r: number;
  name: string | null;
  complete: boolean;
  version: number;
  completedDay: number | null;
  count: number;
}

export interface SkyData {
  baseUrl: string;
  index: SkyIndex;
  constellations: ConstellationInfo[];
  byId: Map<number, ConstellationInfo>;
  grid: ConstellationGrid;
  /** Distance from the Sun to the outer edge of the sky (constellations and unlocked planets). */
  radius: number;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export async function loadSkyData(baseUrl: string, fetchImpl: Fetch = fetch): Promise<SkyData> {
  const latest = await getJson<{ index: string }>(fetchImpl, `${baseUrl}/${paths.latest}`, true);
  const index = await getJson<SkyIndex>(fetchImpl, `${baseUrl}/${latest.index}`);
  return buildSkyData(baseUrl, index);
}

export function buildSkyData(baseUrl: string, index: SkyIndex): SkyData {
  const constellations = index.constellations.map(
    ([id, x, y, r, name, status, version, completedDay, count]): ConstellationInfo => ({
      id,
      x,
      y,
      r,
      name,
      complete: status === 1,
      version,
      completedDay,
      count,
    }),
  );
  const unlockedOrbits = index.planets.filter((p) => p[4] !== null).map((p) => p[3]);
  const radius = Math.max(
    CONSTELLATION_RADIUS * 3,
    ...constellations.map((c) => Math.hypot(c.x, c.y) + c.r),
    ...unlockedOrbits,
  );
  return {
    baseUrl,
    index,
    constellations,
    byId: new Map(constellations.map((c) => [c.id, c])),
    grid: new ConstellationGrid(constellations),
    radius,
  };
}

async function getJson<T>(fetchImpl: Fetch, url: string, fresh = false): Promise<T> {
  const response = await fetchImpl(url, fresh ? { cache: "no-cache" } : undefined);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return (await response.json()) as T;
}

/** Uniform grid over constellation discs for fast "what is on screen" queries. */
export class ConstellationGrid {
  private cells = new Map<string, ConstellationInfo[]>();
  private readonly size = CONSTELLATION_RADIUS * 4;

  constructor(constellations: ConstellationInfo[]) {
    for (const c of constellations) {
      for (const key of this.keys(c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r)) {
        const cell = this.cells.get(key);
        if (cell) cell.push(c);
        else this.cells.set(key, [c]);
      }
    }
  }

  private *keys(x0: number, y0: number, x1: number, y1: number) {
    for (let gx = Math.floor(x0 / this.size); gx <= Math.floor(x1 / this.size); gx++) {
      for (let gy = Math.floor(y0 / this.size); gy <= Math.floor(y1 / this.size); gy++) {
        yield `${gx},${gy}`;
      }
    }
  }

  /** Constellations whose disc touches the rectangle. */
  query(rect: WorldRect): ConstellationInfo[] {
    const found = new Set<ConstellationInfo>();
    const cellsAcross = (rect.x1 - rect.x0) / this.size;
    if (cellsAcross > 400) return []; // far too zoomed out for star files anyway
    for (const key of this.keys(rect.x0, rect.y0, rect.x1, rect.y1)) {
      for (const c of this.cells.get(key) ?? []) {
        if (
          c.x + c.r >= rect.x0 &&
          c.x - c.r <= rect.x1 &&
          c.y + c.r >= rect.y0 &&
          c.y - c.r <= rect.y1
        ) {
          found.add(c);
        }
      }
    }
    return [...found];
  }
}

export interface LoadedConstellation {
  info: ConstellationInfo;
  file: ConstellationFile;
}

export interface CacheOptions {
  /** Most constellation files kept in memory. */
  limit?: number;
  concurrency?: number;
  fetchImpl?: Fetch;
  onLoad?: (loaded: LoadedConstellation) => void;
  onEvict?: (id: number) => void;
}

/**
 * In-memory cache of constellation files. `want()` declares what is on screen (nearest first);
 * missing files are fetched a few at a time, and when the cache is over its limit the files
 * farthest from the camera that are not wanted are dropped.
 */
export class ConstellationCache {
  private loaded = new Map<number, LoadedConstellation>();
  private inFlight = new Set<number>();
  private queue: ConstellationInfo[] = [];
  private failed = new Map<number, number>();
  private readonly limit: number;
  private readonly concurrency: number;
  private readonly fetchImpl: Fetch;

  constructor(
    private baseUrl: string,
    private options: CacheOptions = {},
  ) {
    this.limit = options.limit ?? 400;
    this.concurrency = options.concurrency ?? 6;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  }

  get(id: number) {
    return this.loaded.get(id);
  }

  get size() {
    return this.loaded.size;
  }

  get pending() {
    return this.inFlight.size + this.queue.length;
  }

  /** Declares the constellations needed now, in priority order, and evicts if needed. */
  want(list: ConstellationInfo[], center: { x: number; y: number }) {
    const now = Date.now();
    this.queue = list.filter((c) => {
      const current = this.loaded.get(c.id);
      if (current && current.info.version === c.version) return false;
      if (this.inFlight.has(c.id)) return false;
      const failedAt = this.failed.get(c.id);
      return !failedAt || now - failedAt > 15_000; // retry failures after a while
    });
    this.pump();
    this.evict(new Set(list.map((c) => c.id)), center);
  }

  private pump() {
    while (this.inFlight.size < this.concurrency && this.queue.length) {
      const info = this.queue.shift()!;
      this.inFlight.add(info.id);
      this.fetchImpl(`${this.baseUrl}/${paths.constellation(info.id, info.version)}`)
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json() as Promise<ConstellationFile>;
        })
        .then((file) => {
          this.failed.delete(info.id);
          const loaded = { info, file };
          this.loaded.set(info.id, loaded);
          this.options.onLoad?.(loaded);
        })
        .catch(() => this.failed.set(info.id, Date.now()))
        .finally(() => {
          this.inFlight.delete(info.id);
          this.pump();
        });
    }
  }

  private evict(keep: Set<number>, center: { x: number; y: number }) {
    if (this.loaded.size <= this.limit) return;
    const candidates = [...this.loaded.values()]
      .filter((l) => !keep.has(l.info.id))
      .sort(
        (a, b) =>
          Math.hypot(b.info.x - center.x, b.info.y - center.y) -
          Math.hypot(a.info.x - center.x, a.info.y - center.y),
      );
    for (const victim of candidates.slice(0, this.loaded.size - this.limit)) {
      this.loaded.delete(victim.info.id);
      this.options.onEvict?.(victim.info.id);
    }
  }
}
