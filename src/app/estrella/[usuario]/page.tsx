import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import SkyApp from "@/components/app/SkyApp";
import { normalizeUsername } from "@/sky/username";

// Share links: /@usuario is rewritten here (next.config.ts). The page opens the sky on that star
// (it reads the path in the browser) and, when shared, shows the star's postcard as preview.

export async function generateMetadata({
  params,
}: PageProps<"/estrella/[usuario]">): Promise<Metadata> {
  const { usuario } = await params;
  const username = normalizeUsername(decodeURIComponent(usuario));
  if (!username) notFound();

  const title = `@${username} · Constelaciones`;
  const description = "Mira su estrella en el cielo de Constelaciones y busca la tuya.";
  const image = {
    url: `/api/postal/${username}`,
    width: 1080,
    height: 1920,
    alt: `Postal de la estrella @${username}`,
  };
  return {
    title,
    description,
    openGraph: { title, description, images: [image], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

/** Marks the page as per-request (its metadata depends on the name in the path). */
async function PerRequest() {
  await connection();
  return null;
}

export default function StarPage() {
  return (
    <main>
      <SkyApp />
      <Suspense>
        <PerRequest />
      </Suspense>
    </main>
  );
}
