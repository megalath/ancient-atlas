import fs from "node:fs";
import { expect, test } from "@playwright/test";

const shots = "/opt/cursor/artifacts/screenshots";

test.beforeAll(() => {
  fs.mkdirSync(shots, { recursive: true });
});

test("tapping the Sport Model reactor opens an info panel with an image and a source", async ({ page }, testInfo) => {
  await page.goto("/?site=area-51&feature=reactor");
  await page.locator(".stage canvas").waitFor({ state: "visible" });

  const opener = page.getByRole("button", { name: "Features", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.getByRole("button", { name: "Reactor", exact: true }).click();

  const panel = page.getByTestId("feature-panel");
  const heading = panel.getByRole("heading", { name: "Reactor" });
  await expect(heading).toBeVisible();
  await heading.scrollIntoViewIfNeeded();
  await expect(panel.locator(".badge.testimony").first()).toBeVisible();
  await expect(panel.locator(".description")).toContainText(/18/);
  await expect(panel.locator(".description")).toContainText(/testimony/i);

  const image = panel.locator("img").first();
  await image.scrollIntoViewIfNeeded();
  await expect(image).toBeVisible();
  await expect.poll(async () => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(20);
  await expect(panel.locator("figcaption").first()).toContainText(/CC0|Ancient Atlas/i);
  await expect(panel.locator(".read-more").getByRole("link").first()).toBeVisible();
  const source = panel.locator(".facts a").first();
  await expect(source).toBeVisible();
  await expect(page).toHaveURL(/[?&]site=area-51/);
  await expect(page).toHaveURL(/feature=reactor/);

  await page.screenshot({ path: `${shots}/sport-model-reactor-${testInfo.project.name}.png` });
});

test("Area 51 opens from the globe onto the lake", async ({ page }, testInfo) => {
  await page.goto("/?site=area-51&feature=groom-lake");
  await page.locator(".stage canvas").waitFor({ state: "visible" });
  const opener = page.getByRole("button", { name: "Features", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.getByRole("button", { name: "Groom Lake", exact: true }).click();
  const panel = page.getByTestId("feature-panel");
  await expect(panel.getByRole("heading", { name: "Groom Lake" })).toBeVisible();
  await expect(panel.locator(".badge.verified").first()).toBeVisible();
  const canvas = page.locator(".stage canvas");
  await expect.poll(async () => canvasContrast(canvas), { timeout: 15_000 }).toBeGreaterThan(12);
  await page.screenshot({ path: `${shots}/area-51-groom-${testInfo.project.name}.png` });
});

async function canvasContrast(canvas: import("@playwright/test").Locator) {
  return canvas.evaluate((element: HTMLCanvasElement) => {
    const gl = element.getContext("webgl2") || element.getContext("webgl");
    if (!gl) return 0;
    const size = 24;
    const pixels = new Uint8Array(size * size * 4);
    const x = Math.max(0, Math.floor(element.width / 2) - size / 2);
    const y = Math.max(0, Math.floor(element.height / 2) - size / 2);
    gl.readPixels(x, y, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let min = 255;
    let max = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const luma = pixels[i] * 0.3 + pixels[i + 1] * 0.59 + pixels[i + 2] * 0.11;
      if (luma < min) min = luma;
      if (luma > max) max = luma;
    }
    return max - min;
  });
}
