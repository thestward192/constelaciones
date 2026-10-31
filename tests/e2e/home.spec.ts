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
