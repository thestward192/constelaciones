import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Fonts for server-side images (postcard, constellation image). Read once per server.

const font = (file: string) => readFile(join(process.cwd(), "assets", "fonts", file));

let loaded: Promise<
  { name: string; data: Buffer; weight: 400 | 500 | 600; style: "normal" }[]
> | null = null;

export function imageFonts() {
  loaded ??= Promise.all([
    font("cormorant-garamond-latin-600-normal.woff"),
    font("ibm-plex-sans-latin-500-normal.woff"),
    font("ibm-plex-mono-latin-400-normal.woff"),
    font("ibm-plex-mono-latin-500-normal.woff"),
  ]).then(([display, sans, mono, monoMedium]) => [
    { name: "Cormorant", data: display, weight: 600, style: "normal" },
    { name: "Plex Sans", data: sans, weight: 500, style: "normal" },
    { name: "Plex Mono", data: mono, weight: 400, style: "normal" },
    { name: "Plex Mono Medium", data: monoMedium, weight: 500, style: "normal" },
  ]);
  return loaded;
}
