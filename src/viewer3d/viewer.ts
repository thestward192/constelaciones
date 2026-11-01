import * as THREE from "three";
import { createRng } from "../sky/random";
import { LEVEL_LOOKS, PLANET_LOOKS, SUN_LOOK, type BodyLook, type StarExtras } from "./params";
import { GLOW_FRAGMENT, GLOW_VERTEX, SURFACE_FRAGMENT, SURFACE_VERTEX } from "./shaders";

// The 3D view (docs/constelaciones-diseno.md, section 7). This module, and three.js with it,
// is only downloaded when someone opens a 3D view for the first time.

export type ViewerSubject =
  | { kind: "star"; level: number; extras: StarExtras }
  | { kind: "sun" }
  | { kind: "planet"; name: string };

export class WebGLUnavailableError extends Error {}

const MIN_DISTANCE = 4.2;
const MAX_DISTANCE = 14;
const GOLD = 0xe8cb8f;

type Animate = (t: number) => void;

/**
 * One scene with one body built from parameters. show() rebuilds the body (level previews,
 * Sun, planets); destroy() stops everything and frees the GPU: nothing stays behind.
 */
export class Viewer3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
  private group = new THREE.Group();
  private sphere = new THREE.SphereGeometry(1, 64, 64);
  private glow: THREE.CanvasTexture;
  private streak: THREE.CanvasTexture;
  private background: THREE.Points;
  private animations: Animate[] = [];
  private rotX = 0.32;
  private rotY = 0;
  private distance = 8.5;
  private dragging = false;
  private start = performance.now();
  private observer: ResizeObserver;
  private pointers = new Map<number, { x: number; y: number }>();
  private last: { x: number; y: number } | null = null;
  private pinch: { distance: number; start: number } | null = null;

  private constructor(
    private host: HTMLElement,
    private reducedMotion: boolean,
  ) {
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    } catch {
      throw new WebGLUnavailableError("WebGL is not available");
    }
    // Quality limited on very dense screens, to save battery.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(0x04060f, 1);
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "none";
    canvas.style.cursor = "grab";
    host.appendChild(canvas);

    this.glow = canvasTexture(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, "rgba(255,255,255,1)");
      r.addColorStop(0.14, "rgba(255,255,255,.62)");
      r.addColorStop(0.38, "rgba(255,255,255,.14)");
      r.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
    });
    this.streak = canvasTexture(256, 32, (g) => {
      const a = g.createLinearGradient(0, 0, 256, 0);
      a.addColorStop(0, "rgba(255,255,255,0)");
      a.addColorStop(0.5, "rgba(255,255,255,1)");
      a.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = a;
      g.fillRect(0, 0, 256, 32);
      g.globalCompositeOperation = "destination-in";
      const b = g.createLinearGradient(0, 0, 0, 32);
      b.addColorStop(0, "rgba(0,0,0,0)");
      b.addColorStop(0.5, "rgba(0,0,0,1)");
      b.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = b;
      g.fillRect(0, 0, 256, 32);
    });

    // Background of distant stars.
    const rng = createRng(99, "viewer-background");
    const count = 1200;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = rng.next() * 2 - 1;
      const th = rng.next() * Math.PI * 2;
      const r = 50 + rng.next() * 60;
      const s = Math.sqrt(1 - u * u);
      positions.set([s * Math.cos(th) * r, u * r, s * Math.sin(th) * r], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.background = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.55,
        map: this.glow,
        color: 0xc9d3ec,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.background, this.group);

    canvas.addEventListener("pointerdown", this.down);
    canvas.addEventListener("pointermove", this.move);
    canvas.addEventListener("pointerup", this.up);
    canvas.addEventListener("pointercancel", this.up);
    canvas.addEventListener("wheel", this.wheel, { passive: false });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.renderer.setAnimationLoop(this.frame);
  }

  static create(host: HTMLElement, options: { reducedMotion: boolean }): Viewer3D {
    if (!supportsWebGL()) throw new WebGLUnavailableError("WebGL is not available");
    return new Viewer3D(host, options.reducedMotion);
  }

  show(subject: ViewerSubject) {
    this.clear();
    if (subject.kind === "star") {
      this.buildBody(LEVEL_LOOKS[subject.level]);
      this.buildExtras(LEVEL_LOOKS[subject.level].size, subject.extras);
    } else if (subject.kind === "sun") {
      this.buildBody(SUN_LOOK);
    } else {
      this.buildBody(PLANET_LOOKS[subject.name] ?? PLANET_LOOKS.Tierra);
    }
  }

  destroy() {
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.down);
    canvas.removeEventListener("pointermove", this.move);
    canvas.removeEventListener("pointerup", this.up);
    canvas.removeEventListener("pointercancel", this.up);
    canvas.removeEventListener("wheel", this.wheel);
    this.clear();
    disposeTree(this.background);
    this.sphere.dispose();
    this.glow.dispose();
    this.streak.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }

  // ---------------------------------------------------------------- building

  private clear() {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      disposeTree(child, this.sphere);
    }
    this.animations = [];
  }

  private add<T extends THREE.Object3D>(object: T, parent: THREE.Object3D = this.group): T {
    parent.add(object);
    return object;
  }

  private buildBody(look: BodyLook) {
    const size = look.size;
    const warm = new THREE.Color(look.c2).lerp(new THREE.Color(look.c1), 0.45);

    // Surface: animated granulation, or a planet lit from the upper left.
    const uniforms = {
      t: { value: 0 },
      c1: { value: new THREE.Color(look.c1) },
      c2: { value: new THREE.Color(look.c2) },
      ns: { value: look.noise },
      stretch: {
        value: look.banded ? new THREE.Vector3(0.35, 3.2, 0.35) : new THREE.Vector3(1, 1, 1),
      },
      lit: { value: look.lit ? 1 : 0 },
      lightDir: { value: new THREE.Vector3(-0.8, 0.45, 0.6) },
    };
    const surface = this.add(
      new THREE.Mesh(
        this.sphere,
        new THREE.ShaderMaterial({
          uniforms,
          vertexShader: SURFACE_VERTEX,
          fragmentShader: SURFACE_FRAGMENT,
        }),
      ),
    );
    surface.scale.setScalar(size);
    this.animations.push((t) => {
      uniforms.t.value = t * look.speed;
      surface.rotation.y = t * 0.04;
    });

    // Atmosphere.
    const shell = this.add(
      new THREE.Mesh(
        this.sphere,
        new THREE.ShaderMaterial({
          uniforms: {
            c: { value: look.lit ? new THREE.Color(look.c1) : warm },
            k: { value: look.glow },
          },
          vertexShader: GLOW_VERTEX,
          fragmentShader: GLOW_FRAGMENT,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        }),
      ),
    );
    shell.scale.setScalar(size * (look.lit ? 1.12 : 1.35));

    // Corona (stars and the Sun).
    if (look.corona > 0) {
      const corona = this.add(
        new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.glow,
            color: warm,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            opacity: size >= 1.3 ? 0.6 : 0.9,
          }),
        ),
      );
      const cs = size * look.corona;
      corona.scale.set(cs, cs, 1);
      this.animations.push((t) => {
        const k = 1 + Math.sin(t * 1.4) * (look.pulse ? 0.07 : 0.025);
        corona.scale.set(cs * k, cs * k, 1);
      });
    }

    // Cross flares (Nova: one cross; Supernova: two crosses).
    const angles = [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4];
    for (let i = 0; i < (look.spikes ?? 0); i++) {
      const material = new THREE.SpriteMaterial({
        map: this.streak,
        color: 0xfff1d8,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        rotation: angles[i],
        opacity: i < 2 ? 0.55 : 0.3,
      });
      const spike = this.add(new THREE.Sprite(material));
      const length = size * (i < 2 ? 8 : 5.5);
      spike.scale.set(length, length * 0.07, 1);
      this.animations.push((t) => {
        material.opacity = (i < 2 ? 0.5 : 0.26) + Math.sin(t * 2.1 + i) * 0.08;
      });
    }

    // Shock wave of particles that keeps repeating (Supernova).
    if (look.shockwave) {
      const rng = createRng(7, "shockwave");
      const n = 900;
      const points = new Float32Array(n * 3);
      for (let j = 0; j < n; j++) {
        const u = rng.next() * 2 - 1;
        const th = rng.next() * Math.PI * 2;
        const q = Math.sqrt(1 - u * u);
        const r = 1 + rng.next() * 0.12;
        points.set([q * Math.cos(th) * r, u * r, q * Math.sin(th) * r], j * 3);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
      const material = new THREE.PointsMaterial({
        size: 0.16,
        map: this.glow,
        color: 0xffb48a,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const wave = this.add(new THREE.Points(geometry, material));
      this.animations.push((t) => {
        const p = (t * 0.12) % 1;
        wave.scale.setScalar(size * (1.6 + p * 2.4));
        material.opacity = (1 - p) * 0.8;
        wave.rotation.y = t * 0.05;
      });
    }

    // Saturn's rings.
    if (look.planetRings) {
      const ring = this.add(
        new THREE.Mesh(
          new THREE.RingGeometry(size * 1.35, size * 2.3, 160),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(look.c1),
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        ),
      );
      ring.rotation.x = Math.PI / 2 - 0.42;
      ring.rotation.z = 0.18;
    }
  }

  private buildExtras(size: number, extras: StarExtras) {
    // Golden rings by invitations, tilted like Saturn's.
    for (let k = 0; k < extras.rings; k++) {
      const r0 = size * (1.95 + k * 0.48);
      const ring = this.add(
        new THREE.Mesh(
          new THREE.RingGeometry(r0, r0 + 0.03 + k * 0.01, 160),
          new THREE.MeshBasicMaterial({
            color: GOLD,
            transparent: true,
            opacity: 0.6 - k * 0.1,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        ),
      );
      ring.rotation.x = Math.PI / 2 - 0.42;
      ring.rotation.z = 0.18;
    }

    // Satellite (100 invited).
    if (extras.satellite) {
      const pivot = this.add(new THREE.Group());
      pivot.rotation.x = 0.5;
      const satellite = this.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 24, 24),
          new THREE.MeshBasicMaterial({ color: 0xfff3d8 }),
        ),
        pivot,
      );
      satellite.position.x = size * 3.6;
      const halo = this.add(
        new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.glow,
            color: 0xffe7b0,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
          }),
        ),
        satellite,
      );
      halo.scale.set(0.7, 0.7, 1);
      this.animations.push((t) => {
        pivot.rotation.y = t * 0.5;
      });
    }

    // Crown of points of light (500 invited).
    if (extras.crown) {
      const n = 36;
      const points = new Float32Array(n * 3);
      for (let c = 0; c < n; c++) {
        const a = (c / n) * Math.PI * 2;
        points.set([Math.cos(a) * size * 1.55, size * 1.15, Math.sin(a) * size * 1.55], c * 3);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
      const crown = this.add(
        new THREE.Points(
          geometry,
          new THREE.PointsMaterial({
            size: 0.22,
            map: this.glow,
            color: 0xffe2a0,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        ),
      );
      this.animations.push((t) => {
        crown.rotation.y = -t * 0.3;
      });
    }

    // Comet with a trail (was a shooting star).
    if (extras.comet) {
      const n = 46;
      const positions = new Float32Array(n * 3);
      const colors = new Float32Array(n * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const orbit = this.add(new THREE.Group());
      orbit.rotation.set(-0.7, 0, 0.35);
      this.add(
        new THREE.Points(
          geometry,
          new THREE.PointsMaterial({
            size: 0.2,
            map: this.glow,
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        ),
        orbit,
      );
      const radius = size * 2.9 + extras.rings * 0.45;
      this.animations.push((t) => {
        const a0 = t * 0.9;
        for (let i = 0; i < n; i++) {
          const a = a0 - i * 0.035;
          const f = (1 - i / n) ** 2;
          positions.set([Math.cos(a) * radius, 0, Math.sin(a) * radius], i * 3);
          colors.set([f, f * 0.9, f * 0.75], i * 3);
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
      });
    }
  }

  // ---------------------------------------------------------------- loop and input

  private frame = (now: number) => {
    const t = ((now - this.start) / 1000) * (this.reducedMotion ? 0.25 : 1);
    for (const animate of this.animations) animate(t);
    if (!this.dragging && !this.reducedMotion) this.rotY += 0.0022;
    this.group.rotation.set(this.rotX, this.rotY, 0);
    this.camera.position.set(0, 0, this.distance);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  };

  private resize() {
    const width = this.host.clientWidth || window.innerWidth;
    const height = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // On phones, a wider view so everything fits.
    this.camera.fov = width < 700 ? 52 : 38;
    this.camera.updateProjectionMatrix();
  }

  private down = (e: PointerEvent) => {
    const canvas = this.renderer.domElement;
    canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.last = { x: e.clientX, y: e.clientY };
      this.dragging = true;
      canvas.style.cursor = "grabbing";
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), start: this.distance };
      this.last = null;
    }
  };

  private move = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.distance = clamp(
        (this.pinch.start * this.pinch.distance) / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        MIN_DISTANCE,
        MAX_DISTANCE,
      );
      return;
    }
    if (this.last) {
      this.rotY += (e.clientX - this.last.x) * 0.008;
      this.rotX = clamp(this.rotX + (e.clientY - this.last.y) * 0.008, -1.2, 1.2);
      this.last = { x: e.clientX, y: e.clientY };
    }
  };

  private up = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!this.pointers.size) {
      this.last = null;
      this.dragging = false;
      this.renderer.domElement.style.cursor = "grab";
    }
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.distance = clamp(this.distance * Math.exp(e.deltaY * 0.001), MIN_DISTANCE, MAX_DISTANCE);
  };
}

function canvasTexture(
  width: number,
  height: number,
  paint: (g: CanvasRenderingContext2D) => void,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext("2d")!);
  return new THREE.CanvasTexture(canvas);
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

/** Frees geometries and materials of a subtree (shared sphere and textures stay). */
function disposeTree(root: THREE.Object3D, keep?: THREE.BufferGeometry) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry && mesh.geometry !== keep) mesh.geometry.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
