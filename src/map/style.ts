// Visual constants of the map, from docs/constelaciones-diseno.md and the HTML prototype.

export const COLORS = {
  sky: 0x050813,
  sky2: 0x0b1326,
  ink: 0xeceff6,
  ink2: 0xa3adc4,
  ink3: 0x6d7892,
  gold: 0xe8cb8f,
  blue: 0x9dc3ff,
  line: 0xc8d4f0,
} as const;

export const CSS = {
  ink: "#eceff6",
  ink2: "#a3adc4",
  ink3: "#6d7892",
  gold: "#e8cb8f",
} as const;

/** Per level: base radius in screen px at zoom 1, and color (prototype values). */
export const LEVEL_STYLE: { r: number; color: [number, number, number] }[] = [
  { r: 1.15, color: [214, 221, 236] }, // Chispa
  { r: 1.6, color: [255, 160, 128] }, // Enana roja
  { r: 2.1, color: [255, 226, 160] }, // Estrella amarilla
  { r: 2.8, color: [160, 198, 255] }, // Gigante azul
  { r: 3.6, color: [214, 228, 255] }, // Supergigante
  { r: 4.3, color: [255, 244, 220] }, // Nova
  { r: 5.2, color: [255, 255, 255] }, // Supernova
];

/** Star radius on screen grows slowly with zoom, as in the prototype. */
export const STAR_ZOOM_EXPONENT = 0.45;
export const starScreenRadius = (level: number, zoom: number, anchor = false) =>
  LEVEL_STYLE[level].r * zoom ** STAR_ZOOM_EXPONENT * (anchor ? 1.25 : 1);

/** Sun radius in world units: bigger than any person's star, smaller than the gap to constellation 1. */
export const SUN_RADIUS = 80;

/** Planet look in 2D: color, world radius, and whether it has rings. */
export const PLANET_STYLE: Record<
  string,
  { color: [number, number, number]; radius: number; rings?: boolean }
> = {
  Mercurio: { color: [176, 166, 156], radius: 34 },
  Venus: { color: [232, 206, 160], radius: 46 },
  Tierra: { color: [110, 160, 230], radius: 48 },
  Marte: { color: [214, 120, 88], radius: 40 },
  Júpiter: { color: [222, 186, 150], radius: 110 },
  Saturno: { color: [226, 204, 160], radius: 95, rings: true },
  Urano: { color: [160, 220, 228], radius: 75 },
  Neptuno: { color: [100, 140, 230], radius: 72 },
};

export const toRoman = (n: number): string => {
  if (n <= 0 || n >= 4000) return String(n);
  const table: [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let out = "";
  for (const [value, symbol] of table) {
    while (n >= value) {
      out += symbol;
      n -= value;
    }
  }
  return out;
};

export const rgba = (c: [number, number, number], a: number) =>
  `rgba(${c[0]},${c[1]},${c[2]},${a})`;
