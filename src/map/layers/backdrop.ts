import { Container, Particle, ParticleContainer, Sprite, Texture } from "pixi.js";
import { hash01, type FrameState } from "../frame";
import type { SkyData } from "../sky-data";
import { canvasTexture, CELL, type Atlas } from "../textures";

const DUST = 700;

/**
 * Screen-space background: the night gradient, parallax dust (depth, not people), the band of
 * the galaxy from stage 2 (La Vía Láctea) and distant galaxies from stage 3 (El Universo).
 */
export class Backdrop {
  readonly container = new Container();
  private gradient: Sprite;
  private band: Sprite | null = null;
  private galaxies = new Container();
  private dust: ParticleContainer;
  private specks: { p: Particle; x: number; y: number; depth: number }[] = [];
  private size = { width: 0, height: 0 };

  constructor(atlas: Atlas) {
    this.gradient = new Sprite(skyGradientTexture());
    this.dust = new ParticleContainer({
      texture: atlas.base,
      dynamicProperties: {
        position: true,
        vertex: false,
        rotation: false,
        uvs: false,
        color: false,
      },
    });
    for (let i = 0; i < DUST; i++) {
      const p = new Particle({
        texture: atlas.frames.dot,
        anchorX: 0.5,
        anchorY: 0.5,
        tint: 0xdfe5f5,
        alpha: 0.05 + hash01(i, 1) * 0.14,
      });
      const r = 0.3 + hash01(i, 2) * 0.6;
      p.scaleX = p.scaleY = (r * 2) / (CELL * 0.5);
      this.specks.push({ p, x: hash01(i, 3), y: hash01(i, 4), depth: 0.15 + hash01(i, 5) * 0.25 });
    }
    this.dust.particleChildren = this.specks.map((s) => s.p);
    this.dust.update(); // required after assigning particleChildren directly
    this.container.addChild(this.gradient, this.galaxies, this.dust);
  }

  setData(data: SkyData) {
    this.band?.destroy();
    this.band = null;
    this.galaxies.removeChildren().forEach((c) => c.destroy());
    if (data.index.stage >= 2) {
      this.band = new Sprite({ texture: galaxyBandTexture(), anchor: 0.5, alpha: 0.9 });
      this.container.addChildAt(this.band, 1);
    }
    if (data.index.stage >= 3) {
      for (let i = 0; i < 7; i++) {
        const g = new Sprite({ texture: galaxyTexture(i), anchor: 0.5, alpha: 0.55 });
        g.rotation = hash01(i, 11) * Math.PI;
        this.galaxies.addChild(g);
      }
    }
    this.layout();
  }

  resize(width: number, height: number) {
    this.size = { width, height };
    this.layout();
  }

  private layout() {
    const { width, height } = this.size;
    this.gradient.width = width;
    this.gradient.height = height;
    if (this.band) {
      const diagonal = Math.hypot(width, height);
      this.band.width = diagonal * 1.3;
      this.band.height = diagonal * 0.42;
      this.band.position.set(width / 2, height / 2);
      this.band.rotation = -0.42;
    }
    this.galaxies.children.forEach((g, i) => {
      g.position.set(width * (0.08 + hash01(i, 12) * 0.84), height * (0.08 + hash01(i, 13) * 0.84));
      const s = Math.min(width, height) * (0.05 + hash01(i, 14) * 0.07);
      g.width = s;
      g.height = s * 0.45;
    });
  }

  private placed = false;

  update(frame: FrameState) {
    if (!frame.moved && this.placed) return;
    this.placed = true;
    const { width, height } = frame.view;
    const W = width * 1.6;
    const H = height * 1.6;
    for (const s of this.specks) {
      const x = ((((s.x * W - ((frame.cam.x * s.depth * 0.3) % W)) % W) + W) % W) - width * 0.3;
      const y = ((((s.y * H - ((frame.cam.y * s.depth * 0.3) % H)) % H) + H) % H) - height * 0.3;
      s.p.x = x;
      s.p.y = y;
    }
  }
}

function skyGradientTexture(): Texture {
  // Same stops as the prototype; stretched to the screen.
  return canvasTexture(512, 512, (ctx) => {
    const g = ctx.createRadialGradient(282, 230, 0, 282, 230, 410);
    g.addColorStop(0, "#0d1630");
    g.addColorStop(0.55, "#080d1d");
    g.addColorStop(1, "#04060f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    const n = ctx.createRadialGradient(128, 358, 0, 128, 358, 230);
    n.addColorStop(0, "rgba(70,90,160,0.07)");
    n.addColorStop(1, "rgba(70,90,160,0)");
    ctx.fillStyle = n;
    ctx.fillRect(0, 0, 512, 512);
  });
}

function galaxyBandTexture(): Texture {
  return canvasTexture(1024, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "rgba(120,140,200,0)");
    g.addColorStop(0.5, "rgba(150,165,215,0.10)");
    g.addColorStop(1, "rgba(120,140,200,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 256);
    // Faint unresolved stars along the band.
    for (let i = 0; i < 2600; i++) {
      const x = hash01(i, 21) * 1024;
      const spread = (hash01(i, 22) + hash01(i, 23) + hash01(i, 24) - 1.5) / 1.5;
      const y = 128 + spread * 110;
      ctx.fillStyle = `rgba(225,232,250,${0.04 + hash01(i, 25) * 0.14})`;
      ctx.fillRect(x, y, 1, 1);
    }
  });
}

function galaxyTexture(seed: number): Texture {
  return canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    const warm = hash01(seed, 31) > 0.5;
    g.addColorStop(0, warm ? "rgba(255,236,210,0.55)" : "rgba(214,226,255,0.55)");
    g.addColorStop(0.25, warm ? "rgba(232,203,170,0.18)" : "rgba(160,190,255,0.18)");
    g.addColorStop(1, "rgba(160,190,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

/** The spiral as a cloud of light ("Universo" level). Opaque on black: drawn additively. */
export class OverviewLayer {
  readonly container = new Container();
  private sprite: Sprite | null = null;
  private data: SkyData | null = null;
  private requested = false;

  setData(data: SkyData) {
    this.data = data;
    this.requested = false;
  }

  /** Downloaded only the first time the far zoom is reached; most visits never need it. */
  private async load(data: SkyData) {
    const overview = data.index.overview;
    if (!overview) return;
    try {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.src = `${data.baseUrl}/${overview.path}`;
      await image.decode();
      this.sprite?.destroy();
      this.sprite = new Sprite({ texture: Texture.from(image), anchor: 0.5, blendMode: "add" });
      this.sprite.width = this.sprite.height = overview.radius * 2;
      this.container.addChild(this.sprite);
    } catch {
      // The map still works without it: region spots take over.
    }
  }

  update(frame: FrameState) {
    if (!this.requested && this.data && frame.weights.overview > 0.01) {
      this.requested = true;
      void this.load(this.data);
    }
    this.container.visible = frame.weights.overview > 0.01 && this.sprite !== null;
    this.container.alpha = frame.weights.overview;
  }
}
