import { expect, test } from "@playwright/test";

test("home shows the project name on a dark sky", async ({ page }) => {
  await page.goto("/");

  const title = page.getByRole("heading", { level: 1, name: "Constelaciones" });
  await expect(title).toBeVisible();
  await expect(title).toHaveCSS("font-family", /Cormorant/);

  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe("rgb(5, 8, 19)");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("the sky map fills the screen and can be zoomed", async ({ page }) => {
  await page.goto("/");
  const canvas = page.getByLabel(/Mapa del cielo/);
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const box = await canvas.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box?.width).toBeCloseTo(viewport.width, 0);
  expect(box?.height).toBeCloseTo(viewport.height, 0);

  // Once the sky loads, the zoom controls appear.
  await expect(page.getByRole("button", { name: "Acercar" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Alejar" })).toBeVisible();
});
