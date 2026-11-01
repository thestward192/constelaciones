import { LEVEL_STYLE, toRoman } from "../../map/style";
import { LEVELS } from "../../sky/levels";
import type { ConstellationFile } from "../../sky/public-files";

// Pure parts of the postcard (docs/constelaciones-diseno.md, section 8): the constellation
// drawing and the texts. No fonts, no network: easy to test.

export const POSTAL_WIDTH = 1080;
export const POSTAL_HEIGHT = 1920;

/** IBM Plex Mono advance is 0.6 em. */
const MONO_ADVANCE = 0.6;

/** Font size that fits "@username" in the width (long names get smaller, never cut). */
export function usernameFontSize(username: string, maxWidth = 940, base = 68, min = 34): number {
  const fitting = maxWidth / ((username.length + 1) * MONO_ADVANCE);
  return Math.floor(Math.max(min, Math.min(base, fitting)));
}

export interface PostalTexts {
  username: string;
  constellation: string;
  details: string;
}

export function postalTexts(
  username: string,
  file: Pick<ConstellationFile, "id" | "status" | "name">,
  slot: number,
  bornDay: number,
  level: number,
): PostalTexts {
  const name = file.status === "complete" && file.name ? file.name : "En formación";
  return {
    username: `@${username}`,
    constellation: `Constelación ${toRoman(file.id)} · ${name}`,
    details: `Estrella ${String(slot + 1).padStart(3, "0")} · Día ${bornDay} · ${LEVELS[level]?.name ?? ""}`,
  };
}

/**
 * The person's constellation as an SVG: lines (only when complete, as on the map), every star
 * with the glow of its level, and the person's star with a double gold circle. The star is
 * placed from its own position, so it is marked even if the file predates it by a few seconds.
 */
export function constellationSvg(
  file: ConstellationFile,
  star: { username: string; x: number; y: number; level: number } | null,
  size: number,
): string {
  const stars = star ? file.stars.filter((s) => s[1] !== star.username) : file.stars;
  const xs = [...stars.map((s) => s[2]), ...(star ? [star.x] : [])];
  const ys = [...stars.map((s) => s[3]), ...(star ? [star.y] : [])];
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  const pad = size * 0.1;
  const k = (size - pad * 2) / extent;
  const X = (x: number) => (size / 2 + (x - cx) * k).toFixed(1);
  const Y = (y: number) => (size / 2 + (y - cy) * k).toFixed(1);

  const defs = LEVEL_STYLE.map(
    ({ color: [r, g, b] }, i) =>
      `<radialGradient id="l${i}"><stop offset="0" stop-color="rgb(${r},${g},${b})" stop-opacity="1"/><stop offset=".18" stop-color="rgb(${r},${g},${b})" stop-opacity=".55"/><stop offset=".5" stop-color="rgb(${r},${g},${b})" stop-opacity=".1"/><stop offset="1" stop-color="rgb(${r},${g},${b})" stop-opacity="0"/></radialGradient>`,
  ).join("");

  const lines =
    file.status === "complete" && file.figure
      ? file.figure.edges
          .map(([i, j]) => {
            const a = file.figure!.anchors[i];
            const b = file.figure!.anchors[j];
            return a && b
              ? `<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}"/>`
              : "";
          })
          .join("")
      : "";

  const glowOf = (level: number) => LEVEL_STYLE[level].r * 9.5;
  const dots = stars
    .map(
      ([, , x, y, level]) =>
        `<circle cx="${X(x)}" cy="${Y(y)}" r="${glowOf(level).toFixed(1)}" fill="url(#l${level})"/>`,
    )
    .join("");

  const marker = star ? highlight(X(star.x), Y(star.y), glowOf(star.level)) : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs>${defs}</defs><g stroke="rgba(200,212,240,0.38)" stroke-width="2">${lines}</g>${dots}${marker}</svg>`;
}

/** Double gold circle around the person's star, with a brighter glow. */
function highlight(mx: string, my: string, glow: number): string {
  return (
    `<circle cx="${mx}" cy="${my}" r="${(glow * 1.8).toFixed(1)}" fill="url(#l6)"/>` +
    `<circle cx="${mx}" cy="${my}" r="30" fill="none" stroke="#e8cb8f" stroke-width="3"/>` +
    `<circle cx="${mx}" cy="${my}" r="44" fill="none" stroke="#e8cb8f" stroke-width="1.5" stroke-opacity=".6"/>`
  );
}
