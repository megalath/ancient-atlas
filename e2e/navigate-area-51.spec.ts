import { expect, test, type Page } from "@playwright/test";

test("searching the globe flies to Area 51, then S-4, the Sport Model, and the reactor", async ({ page }) => {
  await page.goto("/?view=globe");
  const search = page.getByRole("search");
  await search.getByRole("textbox", { name: "Search sites" }).fill("Area 51");
  await search.getByRole("button", { name: /Area 51/ }).click();

  const panel = page.getByTestId("feature-panel");
  await expect(panel.getByRole("heading", { name: "Groom Lake" })).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/site=area-51/);
  await expect(page.getByRole("button", { name: "Back to globe" })).toBeVisible();

  await tapFeature(page, "S-4 hangars");
  await expect(panel.getByRole("heading", { name: "S-4 hangars" })).toBeVisible();
  await tapFeature(page, "Sport Model");
  await expect(panel.getByRole("heading", { name: "Sport Model" })).toBeVisible();
  await tapFeature(page, "Reactor");
  await expect(panel.getByRole("heading", { name: "Reactor" })).toBeVisible();
  await expect(panel.locator(".badge.testimony").first()).toBeVisible();
  await expect(panel.locator("img").first()).toBeVisible();
  await expect(page).toHaveURL(/feature=reactor/);
});

async function tapFeature(page: Page, name: string) {
  const target = page.getByRole("button", { name, exact: true });
  if (await target.isVisible()) {
    await target.click();
    return;
  }
  await page.getByRole("button", { name: "Features", exact: true }).click();
  await target.click();
}
