import { invitationRewards } from "../sky/levels";

// How each thing looks in 3D (docs/constelaciones-diseno.md, section 7). One model of a star,
// changed with parameters; the Sun and the planets use the same system.

export interface BodyLook {
  /** Radius relative to a level-2 star (Estrella amarilla ≈ 1). */
  size: number;
  /** Surface colors: hot (c1) and cool (c2). */
  c1: string;
  c2: string;
  /** Atmosphere strength and corona size (multiple of the radius). 0 corona: none. */
  glow: number;
  corona: number;
  /** Surface noise scale and animation speed. */
  noise: number;
  speed: number;
  pulse?: boolean;
  /** Cross flares: 2 (Nova) or 4 (Supernova). */
  spikes?: number;
  /** Expanding particle wave (Supernova). */
  shockwave?: boolean;
  /** Lit from one side, like a planet (no own light). */
  lit?: boolean;
  /** Planet rings (Saturn). */
  planetRings?: boolean;
  /** Gas giant: the surface is stretched into bands. */
  banded?: boolean;
}

/** Per level, values from the prototype; sizes match table 7.1. */
export const LEVEL_LOOKS: BodyLook[] = [
  { size: 0.55, c1: "#dfe6f5", c2: "#7f8ba6", glow: 0.7, corona: 2.2, noise: 1.6, speed: 0.12 },
  { size: 0.78, c1: "#ffc19e", c2: "#c43a22", glow: 1.0, corona: 2.5, noise: 2.4, speed: 0.18 },
  { size: 0.95, c1: "#fff3cc", c2: "#ee9a2e", glow: 1.2, corona: 2.8, noise: 3.0, speed: 0.24 },
  { size: 1.18, c1: "#eef5ff", c2: "#3f78ff", glow: 1.4, corona: 3.1, noise: 3.4, speed: 0.3 },
  {
    size: 1.5,
    c1: "#ffffff",
    c2: "#86a8ff",
    glow: 1.3,
    corona: 3.5,
    noise: 3.8,
    speed: 0.34,
    pulse: true,
  },
  {
    size: 1.3,
    c1: "#fff8ee",
    c2: "#ffbe6a",
    glow: 1.25,
    corona: 3.6,
    noise: 4.4,
    speed: 0.5,
    pulse: true,
    spikes: 2,
  },
  {
    size: 1.15,
    c1: "#fff4ea",
    c2: "#ff8a5c",
    glow: 1.3,
    corona: 4.0,
    noise: 5.0,
    speed: 0.62,
    pulse: true,
    spikes: 4,
    shockwave: true,
  },
];

export const SUN_LOOK: BodyLook = {
  size: 1.6,
  c1: "#fff1c4",
  c2: "#f0952c",
  glow: 1.3,
  corona: 3.4,
  noise: 2.8,
  speed: 0.2,
  pulse: true,
};

export const PLANET_LOOKS: Record<string, BodyLook> = {
  Mercurio: {
    size: 0.7,
    c1: "#cfc6bb",
    c2: "#6f655c",
    glow: 0.25,
    corona: 0,
    noise: 5,
    speed: 0.01,
    lit: true,
  },
  Venus: {
    size: 1.0,
    c1: "#f3e2bc",
    c2: "#c9a46a",
    glow: 0.6,
    corona: 0,
    noise: 2,
    speed: 0.03,
    lit: true,
  },
  Tierra: {
    size: 1.05,
    c1: "#9fd0ff",
    c2: "#2a5fae",
    glow: 0.9,
    corona: 0,
    noise: 2.6,
    speed: 0.02,
    lit: true,
  },
  Marte: {
    size: 0.85,
    c1: "#f0a27c",
    c2: "#8c3a22",
    glow: 0.4,
    corona: 0,
    noise: 3.2,
    speed: 0.015,
    lit: true,
  },
  Júpiter: {
    size: 1.7,
    c1: "#f1d9b8",
    c2: "#a8744a",
    glow: 0.5,
    corona: 0,
    noise: 1.4,
    speed: 0.04,
    lit: true,
    banded: true,
  },
  Saturno: {
    size: 1.45,
    c1: "#f2e2bd",
    c2: "#b08c58",
    glow: 0.45,
    corona: 0,
    noise: 1.3,
    speed: 0.035,
    lit: true,
    planetRings: true,
    banded: true,
  },
  Urano: {
    size: 1.2,
    c1: "#d4f6f6",
    c2: "#5fb6c2",
    glow: 0.7,
    corona: 0,
    noise: 1.2,
    speed: 0.02,
    lit: true,
  },
  Neptuno: {
    size: 1.2,
    c1: "#9cb8ff",
    c2: "#2a46b0",
    glow: 0.8,
    corona: 0,
    noise: 1.6,
    speed: 0.025,
    lit: true,
  },
};

export interface StarExtras {
  /** Golden rings: 1, 2 or 3 by invitations. */
  rings: number;
  /** Orbiting satellite (100 invited). */
  satellite: boolean;
  /** Crown of points of light (500 invited). */
  crown: boolean;
  /** Comet with a trail (was a shooting star at least once). */
  comet: boolean;
}

export function starExtras(invitedCount: number, shootingCount: number): StarExtras {
  const rewards = invitationRewards(invitedCount);
  return {
    rings: rewards.rings,
    satellite: rewards.satellite,
    crown: rewards.crown,
    comet: shootingCount > 0,
  };
}

/** Labels shown with the 3D star (prototype chips). */
export function extrasChips(invitedCount: number, shootingCount: number): string[] {
  const extras = starExtras(invitedCount, shootingCount);
  const chips: string[] = [];
  if (extras.rings) {
    chips.push(
      `${extras.rings} ${extras.rings === 1 ? "anillo" : "anillos"} · ${invitedCount} invitados`,
    );
  } else if (invitedCount) {
    chips.push(`${invitedCount} ${invitedCount === 1 ? "hilo de luz" : "hilos de luz"}`);
  }
  if (extras.satellite) chips.push("Satélite");
  if (extras.crown) chips.push("Corona de luz");
  if (extras.comet) chips.push("Estela de estrella fugaz");
  return chips;
}
