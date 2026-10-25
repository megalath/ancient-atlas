import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  // Desktop on the CI runner spends most of a minute painting the globe
  // before the panel assertions. The checks themselves stay strict.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    // Hosted runners report a GPU that leaves the canvas unreadably blank.
    // Software WebGL is what the contrast check can actually sample.
    launchOptions: {
      args: process.env.CI
        ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
        : [],
    },
  },
  webServer: {
    // CI builds first, then serves that build. The dev server's error overlay
    // holds the only connections and the panel photograph never finishes loading.
    command: process.env.CI
      ? "npm run start -- --hostname 127.0.0.1 --port 3000"
      : "npm run dev -- --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "iphone", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
    { name: "iphone-landscape", use: { ...devices["iPhone 13 landscape"], defaultBrowserType: "chromium" } },
    { name: "pixel", use: { ...devices["Pixel 5"] } },
    { name: "pixel-landscape", use: { ...devices["Pixel 5 landscape"] } },
  ],
});
