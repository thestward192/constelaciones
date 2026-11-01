import { expect, test, type Page } from "@playwright/test";

// Runs against the Supabase project in .env.local, which holds the test stars ("prueba_*").

async function openSky(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.getByRole("combobox", { name: /Busca tu estrella/ })).toBeVisible({
    timeout: 30_000,
  });
}

async function searchAndPick(page: Page, query: string) {
  const box = page.getByRole("combobox", { name: /Busca tu estrella/ });
  await box.click();
  await box.fill(query);
  const first = page.locator("#search-suggestions button").first();
  await expect(first).toBeVisible({ timeout: 15_000 });
  const username = (await first.locator("span").first().innerText()).replace(/^@/, "");
  await first.click();
  return username;
}

const card = (page: Page) => page.getByRole("article", { name: "Detalle" });

test("search finds a star, travels to it and opens its card", async ({ page }) => {
  await openSky(page);
  const username = await searchAndPick(page, "prueba_r");

  await expect(card(page)).toContainText("Estrella encontrada", { timeout: 15_000 });
  await expect(card(page)).toContainText(`@${username}`);
  await expect(card(page)).toContainText(/Constelación [IVXLCDM]+/);
  await expect(card(page)).toContainText(/Estrella \d{3} de 300 · Nació el día \d+/);
  await expect(card(page)).toContainText(/días? comentando/);
  await expect(page).toHaveURL(new RegExp(`/@${username.replace(".", "\\.")}$`));

  await card(page).getByRole("button", { name: "Cerrar" }).click();
  await expect(card(page)).toBeHidden();
  await expect(page).toHaveURL(/\/$/);

  // Searched stars are remembered: the shortcut appears.
  await expect(page.getByRole("button", { name: "Mi estrella", exact: true })).toBeVisible();
});

test("an unknown name says so", async ({ page }) => {
  await openSky(page);
  const box = page.getByRole("combobox", { name: /Busca tu estrella/ });
  await box.click();
  await box.fill("zzzzzzzzzzzzzzzzzzzz");
  await expect(page.getByText("No hay ninguna estrella con ese nombre todavía.")).toBeVisible({
    timeout: 15_000,
  });
});

test("a shared /@usuario link opens the sky on that star", async ({ page, browser }) => {
  await openSky(page);
  const username = await searchAndPick(page, "prueba_ri");
  await expect(card(page)).toContainText(`@${username}`, { timeout: 15_000 });

  // Someone else opens the link that was shared.
  const other = await browser.newPage({ viewport: page.viewportSize() ?? undefined });
  await openSky(other, `/@${username}`);
  await expect(card(other)).toContainText("Estrella encontrada", { timeout: 15_000 });
  await expect(card(other)).toContainText(`@${username}`);
  await other.close();
});

test("tapping the Sun shows the summary of the challenge", async ({ page }) => {
  await openSky(page);
  await page.getByRole("button", { name: "Ver todo", exact: true }).click();
  await page.waitForTimeout(3000); // the trip to the Sun

  const { width, height } = page.viewportSize()!;
  const mobile = width <= 860;
  // The Sun sits in the middle of the area not covered by panels.
  const x = mobile ? width / 2 : 360 + (width - 360) / 2;
  const y = mobile ? 120 + (height - 120 - 76) / 2 : 130 + (height - 150) / 2;
  await page.mouse.click(x, y);

  await expect(card(page)).toContainText("El Sol", { timeout: 5_000 });
  await expect(card(page)).toContainText("Estrellas");
  await expect(card(page)).toContainText("Constelaciones");
});

test("no horizontal overflow at 360 px, with and without a card", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openSky(page);
  const overflows = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
  expect(await overflows()).toBe(false);

  await searchAndPick(page, "prueba_r");
  await expect(card(page)).toContainText("Estrella encontrada", { timeout: 15_000 });
  expect(await overflows()).toBe(false);
  const box = await card(page).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
});

test("the 3D view opens from the card, previews levels and closes", async ({ page }) => {
  await openSky(page);
  await searchAndPick(page, "prueba_r");
  await card(page).getByRole("button", { name: "Ver mi estrella en 3D" }).click();

  const viewer = page.getByRole("dialog", { name: "Vista 3D" });
  await expect(viewer.locator("canvas")).toBeVisible({ timeout: 30_000 });
  await expect(viewer).toContainText("Tu estrella en 3D");
  await expect(viewer).toContainText("Tu nivel");

  await viewer.getByRole("button", { name: /Supernova/ }).click();
  await expect(viewer).toContainText("Así se verá tu estrella al llegar a 365 días comentando.");
  await expect(viewer).toContainText("Vista previa");

  await viewer.getByRole("button", { name: "Cerrar vista 3D" }).click();
  await expect(viewer).toBeHidden();
  // Nothing of the 3D view stays behind: only the map's canvases.
  await expect(page.locator("canvas")).toHaveCount(2);
});

test("the postcard opens from the card and can be downloaded", async ({ page }) => {
  await openSky(page);
  const username = await searchAndPick(page, "prueba_r");
  await card(page).getByRole("button", { name: "Ver postal de mi estrella" }).click();

  const postal = page.getByRole("dialog", { name: "Postal de tu estrella" });
  await expect(postal.getByRole("img", { name: `Postal de la estrella @${username}` })).toBeVisible(
    {
      timeout: 30_000,
    },
  );
  const download = postal.getByRole("link", { name: "Descargar postal" });
  await expect(download).toHaveAttribute("download", `constelaciones-${username}.png`);

  await postal.getByRole("button", { name: "Cerrar" }).click();
  await expect(postal).toBeHidden();
});

test("the postcard is a 1080 × 1920 image and the share link uses it as preview", async ({
  page,
  request,
}) => {
  await openSky(page);
  const username = await searchAndPick(page, "prueba_r");

  const image = await request.get(`/api/postal/${username}`);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
  const png = await image.body();
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1920]);

  const html = await (await request.get(`/@${username}`)).text();
  expect(html).toContain(`<title>@${username} · Constelaciones</title>`);
  expect(html).toMatch(
    new RegExp(`og:image" content="[^"]*/api/postal/${username.replace(".", "\.")}"`),
  );

  expect((await request.get("/api/postal/nadie_tiene_este_nombre")).status()).toBe(404);
  expect((await request.get("/cualquier-cosa")).status()).toBe(404);
});
