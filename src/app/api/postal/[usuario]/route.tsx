import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { loadPostalData, PostalNotFound } from "@/server/postal/data";
import {
  constellationSvg,
  POSTAL_HEIGHT,
  POSTAL_WIDTH,
  postalTexts,
  usernameFontSize,
} from "@/server/postal/layout";
import { normalizeUsername } from "@/sky/username";

// Postcard for Instagram stories, 1080 × 1920 (docs/constelaciones-diseno.md, section 8).
// Also the preview image when a /@usuario link is shared.

const font = (file: string) => readFile(join(process.cwd(), "assets", "fonts", file));
const fonts = Promise.all([
  font("cormorant-garamond-latin-600-normal.woff"),
  font("ibm-plex-sans-latin-500-normal.woff"),
  font("ibm-plex-mono-latin-400-normal.woff"),
  font("ibm-plex-mono-latin-500-normal.woff"),
]);

const INK = "#eceff6";
const INK_2 = "#a3adc4";
const INK_3 = "#6d7892";
const GOLD = "#e8cb8f";
const DRAWING = 920;

export async function GET(_request: Request, context: RouteContext<"/api/postal/[usuario]">) {
  const { usuario } = await context.params;
  const username = normalizeUsername(decodeURIComponent(usuario));
  if (!username) return new Response("Nombre de usuario no válido.", { status: 400 });

  let data;
  try {
    data = await loadPostalData(username);
  } catch (error) {
    if (error instanceof PostalNotFound) {
      return new Response("No hay ninguna estrella con ese nombre todavía.", { status: 404 });
    }
    return new Response("No se pudo crear la postal. Inténtalo de nuevo en un momento.", {
      status: 503,
    });
  }

  const { details, file } = data;
  const texts = postalTexts(details.username, file, details.slot, details.bornDay, details.level);
  const svg = constellationSvg(file, details, DRAWING);
  const [display, sans, mono, monoMedium] = await fonts;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: "radial-gradient(ellipse at 50% 42%, #0d1630 0%, #080d1d 55%, #04060f 100%)",
        color: INK,
        fontFamily: "Plex Sans",
      }}
    >
      <div
        style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 150 }}
      >
        <div style={{ fontFamily: "Plex Mono", fontSize: 30, letterSpacing: 9, color: INK_3 }}>
          MI ESTRELLA
        </div>
        <div style={{ fontFamily: "Cormorant", fontSize: 104, marginTop: 18, letterSpacing: 2 }}>
          Constelaciones
        </div>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element -- rendered by the image generator, not a page */}
      <img
        alt=""
        width={DRAWING}
        height={DRAWING}
        src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`}
        style={{ marginTop: 70 }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: 40,
          width: 1000,
        }}
      >
        <div
          style={{
            fontFamily: "Plex Mono Medium",
            fontSize: usernameFontSize(texts.username.slice(1)),
            color: GOLD,
          }}
        >
          {texts.username}
        </div>
        <div style={{ fontSize: 40, marginTop: 26, textAlign: "center" }}>
          {texts.constellation}
        </div>
        <div style={{ fontFamily: "Plex Mono", fontSize: 30, marginTop: 18, color: INK_2 }}>
          {texts.details}
        </div>
        <div
          style={{ width: 400, height: 2, background: "rgba(190,202,230,0.25)", marginTop: 70 }}
        />
        <div style={{ fontSize: 38, marginTop: 50 }}>Busca la tuya · link en la bio</div>
      </div>
    </div>,
    {
      width: POSTAL_WIDTH,
      height: POSTAL_HEIGHT,
      fonts: [
        { name: "Cormorant", data: display, weight: 600, style: "normal" },
        { name: "Plex Sans", data: sans, weight: 500, style: "normal" },
        { name: "Plex Mono", data: mono, weight: 400, style: "normal" },
        { name: "Plex Mono Medium", data: monoMedium, weight: 500, style: "normal" },
      ],
      headers: {
        // Levels change at most once a day; the CDN may keep it an hour.
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
