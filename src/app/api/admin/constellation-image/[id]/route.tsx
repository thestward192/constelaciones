import { ImageResponse } from "next/og";
import { toRoman } from "@/map/style";
import { requireAdmin } from "@/server/admin/session";
import { imageFonts } from "@/server/postal/fonts";
import { constellationSvg, POSTAL_HEIGHT, POSTAL_WIDTH } from "@/server/postal/layout";
import { buildConstellationFileFromDb } from "@/server/publish/publish";
import { getAdminClient } from "@/server/supabase/admin";

// Vertical image of one constellation, to support the daily video (admin only).

const DRAWING = 980;

export async function GET(
  _request: Request,
  context: RouteContext<"/api/admin/constellation-image/[id]">,
) {
  await requireAdmin();
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1)
    return new Response("Constelación no válida.", { status: 400 });

  let file;
  try {
    file = await buildConstellationFileFromDb(getAdminClient(), id, 0);
  } catch {
    return new Response("No existe esa constelación.", { status: 404 });
  }
  if (!file.stars.length)
    return new Response("Esa constelación todavía no tiene estrellas.", { status: 404 });

  const complete = file.status === "complete";
  const svg = constellationSvg(file, null, DRAWING);
  const fonts = await imageFonts();

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: "radial-gradient(ellipse at 50% 45%, #0d1630 0%, #080d1d 55%, #04060f 100%)",
        color: "#eceff6",
        fontFamily: "Plex Sans",
      }}
    >
      <div
        style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 170 }}
      >
        <div style={{ fontFamily: "Plex Mono", fontSize: 32, letterSpacing: 8, color: "#e8cb8f" }}>
          {`CONSTELACIÓN ${toRoman(file.id)}${complete && file.completedDay ? ` · DÍA ${file.completedDay}` : ""}`}
        </div>
        <div style={{ fontFamily: "Cormorant", fontSize: 120, marginTop: 20 }}>
          {complete ? (file.name ?? "") : "En formación"}
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- rendered by the image generator */}
      <img
        alt=""
        width={DRAWING}
        height={DRAWING}
        src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`}
        style={{ marginTop: 60 }}
      />
      <div style={{ fontFamily: "Plex Mono", fontSize: 34, marginTop: 50, color: "#a3adc4" }}>
        {`${file.count} de 300 estrellas`}
      </div>
      <div style={{ fontFamily: "Cormorant", fontSize: 56, marginTop: 70 }}>Constelaciones</div>
    </div>,
    {
      width: POSTAL_WIDTH,
      height: POSTAL_HEIGHT,
      fonts,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="constelacion-${file.id}.png"`,
      },
    },
  );
}
