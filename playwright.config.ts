import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.TOROB_TEST_URL||"http://127.0.0.1:5173",
    headless: true,
    reducedMotion: "reduce",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_BROWSER_PATH ||
        (process.platform === 'win32' ? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" : undefined),
    },
    screenshot: "only-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
