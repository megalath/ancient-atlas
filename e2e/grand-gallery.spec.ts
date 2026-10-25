import fs from "node:fs";
import { expect, test } from "@playwright/test";

const shots = "/opt/cursor/artifacts/screenshots";

test.beforeAll(() => {
  fs.mkdirSync(shots, { recursive: true });
});

test("Grand Gallery shows a description and a picture", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.locator(".stage canvas").waitFor({ state: "visible" });

  const opener = page.getByRole("button", { name: "Features", exact: true });
  if (await opener.isVisible()) await opener.click();

  await page.getByRole("button", { name: "Grand Gallery", exact: true }).click();

  const panel = page.getByTestId("feature-panel");
  const heading = panel.getByRole("heading", { name: "Grand Gallery" });
  await expect(heading).toBeVisible();
  await heading.scrollIntoViewIfNeeded();
  await expect(heading).toBeInViewport();
  const description = panel.locator(".description");
  await expect(description).toContainText(/corbel/i);
  await expect(description).toContainText(/339/);
  await expect(description).toBeInViewport();
  await page.screenshot({ path: `${shots}/grand-gallery-${testInfo.project.name}-text.png` });

  const image = panel.locator("img").first();
  await image.scrollIntoViewIfNeeded();
  await expect(image).toBeVisible();
  await expect(image).toBeInViewport();
  await expect.poll(async () => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(20);
  await expect(panel.locator("figcaption").first()).toContainText(/CC BY|public domain/i);
  await expect(panel.locator("figcaption").first()).toContainText(/Keith Adler|licence|Source/i);
  await expect(panel.locator(".read-more").getByRole("link", { name: /wikipedia/i })).toBeVisible();
  await expect(panel.locator(".read-more").getByRole("link", { name: /petrie/i })).toBeVisible();
  await expect(page).toHaveURL(/[?&]site=khufu&feature=grand-gallery/);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.screenshot({ path: `${shots}/grand-gallery-${testInfo.project.name}.png` });
});
