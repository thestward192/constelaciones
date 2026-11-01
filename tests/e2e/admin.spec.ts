import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

// Admin panel against the Supabase project in .env.local. Sign-in links are generated with the
// service key (the same link the email would contain), so no email is needed.

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
  },
);
const ADMIN_EMAIL = (process.env.ADMIN_EMAILS ?? "").split(",")[0].trim();

async function signIn(page: Page, email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  await page.goto(`/admin/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`);
}

test("the panel asks to sign in", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole("button", { name: "Enviarme un enlace" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("an email that is not allowed cannot get in", async ({ page }) => {
  const email = `prueba.noadmin.${Date.now()}@example.com`;
  try {
    await signIn(page, email);
    await expect(page).toHaveURL(/\/admin\/login\?error=enlace$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
  } finally {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const user = data.users.find((u) => u.email === email);
    if (user) await admin.auth.admin.deleteUser(user.id);
  }
});

test("the owner can run a whole day from the panel", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "creates a day: run it once");
  test.setTimeout(180_000);
  page.on("dialog", (dialog) => dialog.accept());
  await signIn(page, ADMIN_EMAIL);
  await expect(page).toHaveURL(/\/admin$/);

  // 1. Create the day.
  await page.goto("/admin/dias");
  const dayInput = page.getByLabel("Número de día");
  const day = Number(await dayInput.inputValue());
  const stamp = Date.now().toString(36).slice(-6);
  await page
    .getByLabel("Video de Instagram (enlace o código)")
    .fill(`https://www.instagram.com/reel/prueba-${stamp}`);
  await page.getByRole("button", { name: `Crear día ${day}` }).click();
  await expect(page.getByText(`Día ${day} creado.`)).toBeVisible({ timeout: 20_000 });

  // 2. Import comments (one name with a blocked word goes to review).
  const names = ["a", "b", "c"].map((s) => `prueba_e2e_${stamp}_${s}`);
  const flagged = `prueba_e2e_${stamp}_puto`;
  await page.goto(`/admin?dia=${day}`);
  await page
    .getByLabel("Lista de comentarios")
    .fill([`${names[0]}: vengan @${names[1]}`, names[1], names[2], flagged].join("\n"));
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByText("Recibidos 4, nuevos 4")).toBeVisible({ timeout: 20_000 });

  // 3. Process.
  await page.getByRole("button", { name: "Procesar ahora" }).click();
  await expect(
    page.getByText(/Procesados \d+ comentarios: 4 estrellas nuevas, 1 invitaciones/),
  ).toBeVisible({
    timeout: 60_000,
  });

  // 4. Challenge of the day.
  await page.getByLabel("Tipo").selectOption("invitacion");
  await page.getByLabel("Meta").fill("1");
  await page.getByRole("button", { name: "Guardar reto" }).click();
  await expect(page.getByText("Reto guardado.")).toBeVisible({ timeout: 20_000 });
  // The live progress already counts the invitation.
  await expect(page.getByText("Progreso: 1 de 1")).toBeVisible();

  // 5. Shooting star draw, which can only happen once.
  await page.getByLabel("Cuántas").fill("2");
  await page.getByRole("button", { name: "Sortear" }).click();
  // The form is replaced by the winners (2 among the 3 public stars: one is in review).
  await expect(page.getByText("Sorteo hecho el")).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(
    page.getByRole("list", { name: "Ganadores del sorteo" }).getByRole("listitem"),
  ).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Sortear" })).toHaveCount(0);

  // 6. Moderation: approve the flagged name.
  await page.goto("/admin/moderacion");
  const row = page.getByRole("listitem").filter({ hasText: `@${flagged}` });
  await row.getByRole("button", { name: "Aprobar" }).click();
  // Approved: it leaves the review list.
  await expect(row).toHaveCount(0, { timeout: 20_000 });

  // 7. Publish and close the day.
  await page.goto(`/admin?dia=${day}`);
  await page.getByRole("button", { name: "Publicar ahora" }).click();
  await expect(page.getByText(/Publicado|No había cambios/)).toBeVisible({ timeout: 90_000 });
  await page.goto("/admin/dias");
  const dayRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: String(day), exact: true }) });
  await dayRow.getByRole("button", { name: "Cerrar" }).click();
  // The challenge was met: the inviter gets the gold border.
  await expect(
    page.getByText(`Día ${day} cerrado. Reto cumplido: se desbloqueó el borde dorado.`),
  ).toBeVisible({ timeout: 20_000 });
  const { data: inviter } = await admin
    .from("stars")
    .select("gold_border")
    .eq("username", names[0])
    .single();
  expect(inviter?.gold_border).toBe(true);

  // The new stars are on the public page.
  await page.goto(`/@${names[1]}`);
  await expect(page.getByRole("article", { name: "Detalle" })).toContainText(`@${names[0]}`, {
    timeout: 30_000,
  });
});

test("the Instagram page explains how to connect and checks the token", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "reads the shared connection: run it once");
  const { data: connected } = await admin.from("instagram_auth").select("id").maybeSingle();
  test.skip(Boolean(connected), "Instagram is already connected");
  await signIn(page, ADMIN_EMAIL);
  await page.goto("/admin/instagram");
  await expect(page.getByText("Instagram no está conectado")).toBeVisible({ timeout: 20_000 });
  await page
    .getByLabel("Token de acceso de Instagram")
    .fill("token-de-prueba-que-no-sirve-para-nada");
  await page.getByRole("button", { name: "Guardar token" }).click();
  // Instagram rejects it, and nothing is stored.
  await expect(
    page.getByText(/Instagram respondió con un error|venció o no es válido/),
  ).toBeVisible({
    timeout: 20_000,
  });
  const { data: after } = await admin.from("instagram_auth").select("id").maybeSingle();
  expect(after).toBeNull();
});
