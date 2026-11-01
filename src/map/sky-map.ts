import { Application, Container } from "pixi.js";
import {
  clampToWorld,
  fitCircle,
  flightAt,
  flightDuration,
  visibleRect,
  zoomAt,
  type Camera,
  type Viewport,
} from "./camera";
import { resolveFonts, type FrameState } from "./frame";
import { MapInput } from "./input";
import { Backdrop, OverviewLayer } from "./layers/backdrop";
import { EffectsLayer } from "./layers/effects-layer";
import { FigureLayer } from "./layers/figure-layer";
import { NameLayer } from "./layers/name-layer";
import { RegionLayer } from "./layers/region-layer";
import { SolarLayer } from "./layers/solar-layer";
import { StarLayer } from "./layers/star-layer";
import { Minimap } from "./minimap";
import {
  ConstellationCache,
  loadSkyData,
  type ConstellationInfo,
  type LoadedConstellation,
  type SkyData,
} from "./sky-data";
import { COLORS } from "./style";
import { buildAtlas } from "./textures";
import {
  layerWeights,
  LOAD_FROM_ZOOM,
  zoomLevel,
  ZOOM_THRESHOLDS,
  type ZoomLevel,
} from "./zoom-levels";

export interface SkyMapOptions {
  baseUrl: string;
  minimap?: HTMLCanvasElement | null;
  onCamera?: (cam: Camera, level: ZoomLevel) => void;
  onReady?: (data: SkyData) => void;
  onError?: (error: unknown) => void;
}

const MAX_VISIBLE_CONSTELLATIONS = 320;

/** The 2D sky: PixiJS scene, camera, gestures, on-demand data and every layer. */
export class SkyMap {
  private app = new Application();
  private world = new Container();
  private cam: Camera = { x: 0, y: 0, zoom: 0.05 };
  private lastCam: Camera = { x: NaN, y: NaN, zoom: NaN };
  private flight: { from: Camera; to: Camera; start: number; duration: number } | null = null;
  private data: SkyData | null = null;
  private cache: ConstellationCache | null = null;
  private input: MapInput | null = null;
  private minimap: Minimap | null = null;
  private reduced = false;
  private motionQuery: MediaQueryList | null = null;
  private time = 0;
  private lastMinimap = 0;
  private lastNotify = 0;
  private destroyed = false;
  private layers!: {
    backdrop: Backdrop;
    overview: OverviewLayer;
    solar: SolarLayer;
    region: RegionLayer;
    figures: FigureLayer;
    stars: StarLayer;
    names: NameLayer;
    effects: EffectsLayer;
  };

  private constructor(
    private host: HTMLElement,
    private options: SkyMapOptions,
  ) {}

  static async create(host: HTMLElement, options: SkyMapOptions): Promise<SkyMap> {
    const map = new SkyMap(host, options);
    await map.init();
    return map;
  }

  private async init() {
    const fonts = resolveFonts();
    await Promise.all([
      document.fonts.load(`500 11px ${fonts.mono}`),
      document.fonts.load(`600 30px ${fonts.display}`),
    ]).catch(() => {});

    await this.app.init({
      resizeTo: this.host,
      background: COLORS.sky,
      antialias: false,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: "webgl",
      powerPreference: "high-performance",
    });
    if (this.destroyed) return;
    const canvas = this.app.canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute(
      "aria-label",
      "Mapa del cielo. Arrastra para moverte y usa la rueda o pellizca para acercar.",
    );
    canvas.style.display = "block";
    canvas.style.cursor = "grab";
    canvas.style.outline = "none";
    this.host.appendChild(canvas);

    const atlas = buildAtlas();
    this.layers = {
      backdrop: new Backdrop(atlas),
      overview: new OverviewLayer(),
      solar: new SolarLayer(atlas, fonts),
      region: new RegionLayer(atlas, fonts),
      figures: new FigureLayer(fonts),
      stars: new StarLayer(atlas),
      names: new NameLayer(fonts),
      effects: new EffectsLayer(atlas, fonts),
    };
    const l = this.layers;
    this.world.addChild(
      l.overview.container,
      l.effects.world,
      l.solar.world,
      l.region.spots,
      l.figures.lines,
      l.stars.container,
    );
    this.app.stage.addChild(
      l.backdrop.container,
      this.world,
      l.solar.labels,
      l.region.numbers,
      l.figures.labels,
      l.names.container,
      l.effects.screen,
    );
    l.backdrop.resize(this.app.screen.width, this.app.screen.height);
    this.app.renderer.on("resize", (w: number, h: number) => l.backdrop.resize(w, h));

    this.motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced = this.motionQuery.matches;
    this.motionQuery.addEventListener("change", this.onMotionChange);

    this.input = new MapInput(canvas, {
      camera: () => this.cam,
      viewport: () => this.viewport(),
      setCamera: (cam) => {
        this.flight = null;
        this.cam = cam;
      },
      flyTo: (cam) => this.flyTo(cam),
      reducedMotion: () => this.reduced,
    });
    if (this.options.minimap) {
      this.minimap = new Minimap(this.options.minimap, (x, y) => this.flyTo({ ...this.cam, x, y }));
    }

    this.app.ticker.add((ticker) => this.tick(ticker.deltaMS));
    await this.loadData();
  }

  private async loadData() {
    try {
      const data = await loadSkyData(this.options.baseUrl);
      if (this.destroyed) return;
      this.data = data;
      this.cache = new ConstellationCache(data.baseUrl, {
        limit: 420,
        onLoad: (loaded) => this.onLoaded(loaded),
        onEvict: (id) => {
          this.layers.stars.remove(id);
          this.layers.figures.remove(id);
        },
      });
      const l = this.layers;
      l.solar.setData(data);
      l.region.setData(data);
      l.backdrop.setData(data);
      l.effects.setData(data);
      this.minimap?.setData(data);
      l.overview.setData(data);
      this.cam = this.initialCamera(data);
      this.options.onReady?.(data);
    } catch (error) {
      this.options.onError?.(error);
    }
  }

  private onLoaded(loaded: LoadedConstellation) {
    this.layers.stars.add(loaded);
    this.layers.figures.add(loaded, this.data?.index.day ?? null);
  }

  /** Opens on today's constellation(s), or the one forming, at constellation level. */
  private initialCamera(data: SkyData): Camera {
    const view = this.viewport();
    const today = data.constellations.filter(
      (c) => data.index.day !== null && c.completedDay === data.index.day,
    );
    const forming = data.constellations.find((c) => !c.complete);
    const focus = today.length ? today : forming ? [forming] : [];
    if (!focus.length) return this.fitAllCamera();
    const cx = focus.reduce((s, c) => s + c.x, 0) / focus.length;
    const cy = focus.reduce((s, c) => s + c.y, 0) / focus.length;
    const r = Math.max(...focus.map((c) => Math.hypot(c.x - cx, c.y - cy) + c.r));
    const fit = fitCircle(view, cx, cy, r * 1.15, 60);
    if (fit.zoom >= ZOOM_THRESHOLDS.constellation * 1.3) return fit;
    // Too many to show at constellation level: the most recent one.
    const latest = focus[focus.length - 1];
    return fitCircle(view, latest.x, latest.y, latest.r * 1.25, 60);
  }

  private fitAllCamera(): Camera {
    return fitCircle(this.viewport(), 0, 0, (this.data?.radius ?? 1200) * 1.02, 24);
  }

  private viewport(): Viewport {
    return { width: this.app.screen.width, height: this.app.screen.height };
  }

  private tick(deltaMS: number) {
    const dt = Math.min(deltaMS, 100);
    this.time += dt / 1000;
    const view = this.viewport();

    if (this.flight) {
      const t = (performance.now() - this.flight.start) / this.flight.duration;
      this.cam = flightAt(this.flight.from, this.flight.to, view, t);
      if (t >= 1) this.flight = null;
    } else {
      this.input?.step(dt);
    }
    if (this.data) this.cam = clampToWorld(this.cam, this.data.radius * 1.15);

    const moved =
      this.cam.x !== this.lastCam.x ||
      this.cam.y !== this.lastCam.y ||
      this.cam.zoom !== this.lastCam.zoom;
    this.lastCam = this.cam;
    const frame: FrameState = {
      cam: this.cam,
      view,
      rect: visibleRect(this.cam, view, 0.15),
      weights: layerWeights(this.cam.zoom),
      time: this.time,
      dt: dt / 1000,
      reducedMotion: this.reduced,
      today: this.data?.index.day ?? null,
      moved,
    };

    const visible = this.updateVisible(frame);
    const l = this.layers;
    this.world.position.set(
      view.width / 2 - this.cam.x * this.cam.zoom,
      view.height / 2 - this.cam.y * this.cam.zoom,
    );
    this.world.scale.set(this.cam.zoom);
    l.backdrop.update(frame);
    l.overview.update(frame);
    l.solar.update(frame);
    l.region.update(frame, this.data);
    l.stars.update(frame);
    l.figures.update(frame);
    l.names.update(frame, visible);
    l.effects.update(frame);

    const now = performance.now();
    if (this.minimap && (moved || now - this.lastMinimap > 1000) && now - this.lastMinimap > 66) {
      this.minimap.draw(this.data, this.cam, view);
      this.lastMinimap = now;
    }
    if (moved && now - this.lastNotify > 100) {
      this.options.onCamera?.(this.cam, zoomLevel(this.cam.zoom));
      this.lastNotify = now;
    }
  }

  /** Requests the star files of the constellations on screen; returns the loaded ones. */
  private updateVisible(frame: FrameState): LoadedConstellation[] {
    const { stars, figures } = this.layers;
    if (!this.data || !this.cache || frame.cam.zoom < LOAD_FROM_ZOOM) {
      stars.setVisible([]);
      figures.setVisible([]);
      return [];
    }
    const { x, y } = frame.cam;
    const onScreen = this.data.grid
      .query(frame.rect)
      .sort((a, b) => dist(a, x, y) - dist(b, x, y))
      .slice(0, MAX_VISIBLE_CONSTELLATIONS);
    this.cache.want(onScreen, { x, y });
    const loaded: LoadedConstellation[] = [];
    for (const c of onScreen) {
      const l = this.cache.get(c.id);
      if (l) loaded.push(l);
    }
    const ids = loaded.map((l) => l.info.id).sort((a, b) => a - b);
    stars.setVisible(ids);
    figures.setVisible(ids);
    return loaded;
  }

  private onMotionChange = (e: MediaQueryListEvent) => {
    this.reduced = e.matches;
  };

  // ---------------------------------------------------------------- public API

  get camera(): Camera {
    return this.cam;
  }

  get skyData(): SkyData | null {
    return this.data;
  }

  /** Travels smoothly to a camera (instantly with "reduce motion"). */
  flyTo(target: Camera) {
    this.input?.stopInertia();
    const view = this.viewport();
    if (this.reduced) {
      this.flight = null;
      this.cam = target;
      return;
    }
    this.flight = {
      from: this.cam,
      to: target,
      start: performance.now(),
      duration: flightDuration(this.cam, target, view),
    };
  }

  /** Zooms around the center of the screen. */
  zoomBy(factor: number) {
    const view = this.viewport();
    const base = this.flight?.to ?? this.cam;
    this.flyTo(zoomAt(base, view, view.width / 2, view.height / 2, base.zoom * factor));
  }

  /** The Sun with the whole sky in view. */
  fitAll() {
    this.flyTo(this.fitAllCamera());
  }

  /** Stops drawing (while the 3D view is open). */
  pause() {
    this.app.ticker.stop();
  }

  resume() {
    this.app.ticker.start();
  }

  destroy() {
    this.destroyed = true;
    this.input?.destroy();
    this.minimap?.destroy();
    this.motionQuery?.removeEventListener("change", this.onMotionChange);
    try {
      this.app.destroy(true, { children: true, texture: true });
    } catch {
      // init may not have finished
    }
  }
}

const dist = (c: ConstellationInfo, x: number, y: number) => Math.hypot(c.x - x, c.y - y);
