// Render the PNG app icons from the logo SVGs with Playwright's Chromium.
// Run after scripts/build-logo.py:  node scripts/build-icons.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const preinstalled = "/opt/pw-browsers/chromium";
const executablePath = process.env.PW_CHROMIUM_PATH ?? (fs.existsSync(preinstalled) ? preinstalled : undefined);

const jobs = [
  // [source svg, output png, size]
  ["public/logo-mark.svg", "public/icons/icon-192.png", 192],
  ["public/logo-mark.svg", "public/icons/icon-512.png", 512],
  ["public/icons/app-icon.svg", "public/icons/icon-maskable-512.png", 512],
  ["public/icons/app-icon.svg", "src/app/apple-icon.png", 180],
];

const browser = await chromium.launch(executablePath ? { executablePath } : {});
for (const [src, out, size] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const svg = fs.readFileSync(src).toString("base64");
  await page.setContent(
    `<body style="margin:0"><img src="data:image/svg+xml;base64,${svg}" width="${size}" height="${size}" style="display:block"></body>`,
  );
  await page.locator("img").screenshot({ path: out, omitBackground: true });
  await page.close();
  console.log(`wrote ${out}`);
}
await browser.close();
