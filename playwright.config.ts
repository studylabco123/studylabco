import { defineConfig } from "@playwright/test";
import fs from "node:fs";

// Use PW_CHROMIUM_PATH, else the preinstalled Chromium if present, else Playwright's own build.
const preinstalled = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.PW_CHROMIUM_PATH ?? (fs.existsSync(preinstalled) ? preinstalled : undefined);
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: "tests/e2e",
  // A production build is much steadier than `next dev` (no on-demand compiles mid-test).
  workers: 2,
  use: { baseURL: "http://localhost:3000", browserName: "chromium", launchOptions },
  projects: [
    {
      name: "iphone",
      testIgnore: /admin-(config|hours-terms)\.spec\.ts/,
      use: {
        viewport: { width: 393, height: 852 },
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: "windows", testIgnore: /admin-(config|hours-terms)\.spec\.ts/, use: { viewport: { width: 1366, height: 768 } } },
    // Changes shared settings (closed days, online switch, prices, feed token), so it runs alone,
    // after the other projects. `--no-deps` runs just this one.
    {
      name: "config",
      testMatch: /admin-config\.spec\.ts/,
      dependencies: ["iphone", "windows"],
      use: { viewport: { width: 1366, height: 768 } },
    },
    // Also changes shared rows (teaching hours, term dates), so it waits for "config" instead of running beside it.
    {
      name: "config-hours",
      testMatch: /admin-hours-terms\.spec\.ts/,
      dependencies: ["config"],
      use: { viewport: { width: 1366, height: 768 } },
    },
  ],
  webServer: {
    command: "npx next build && npx next start -p 3000",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 600_000,
    // E2E_HARNESS turns on the test-only pages under /test-harness (404 otherwise, including in real production).
    env: { ...loadEnv(".env.test"), E2E_HARNESS: "1" },
  },
});

function loadEnv(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
