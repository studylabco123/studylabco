import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Axe samples colours as rendered, so text caught mid-fade reads as low
// contrast. Under reduced motion every element renders in its final state.
async function gotoSettled(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
}

const axe = (page: Page) => new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

test.describe("site shell", () => {
  test("header shows the logo", async ({ page }) => {
    await page.goto("/");
    const logo = page.locator('header img[alt="Study Lab Co Tutoring logo"]');
    await expect(logo).toBeVisible();
  });

  test("footer links to every legal page", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    const links: [string, string][] = [
      ["Terms", "/terms"],
      ["Refund Policy", "/refunds"],
      ["Privacy", "/privacy"],
      ["Cookies", "/cookies"],
      ["Safeguarding", "/safeguarding"],
      ["Accessibility", "/accessibility"],
    ];
    for (const [name, href] of links) {
      await expect(footer.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    }
    await expect(footer).toContainText("Study Lab Co");
    await expect(footer.getByRole("link", { name: "studylabco123@gmail.com" })).toHaveAttribute(
      "href",
      "mailto:studylabco123@gmail.com",
    );
  });

  test("mobile nav opens with the keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto("/");
    const menuButton = page.getByRole("button", { name: "Menu" });
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      if (await menuButton.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(menuButton).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    const menu = page.locator("#mobile-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link", { name: "Home" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(menuButton).toBeFocused();
  });

  test("has no axe violations", async ({ page }) => {
    await gotoSettled(page);
    const results = await axe(page);
    expect(results.violations).toEqual([]);
  });

  test("has no axe violations at default motion once animations finish", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    // Scroll through the page so every reveal fires, then wait for all motion to end.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= height; y += 300) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(50);
    }
    await page.waitForFunction(() =>
      [...document.querySelectorAll("[data-reveal]")].every((el) => el.hasAttribute("data-revealed")),
    );
    await page.waitForFunction(() => document.getAnimations().length === 0);
    // Back to the top so the sticky header does not sit over footer links (page height varies with the owner-name line).
    await page.evaluate(() => window.scrollTo(0, 0));
    const results = await axe(page);
    expect(results.violations).toEqual([]);
  });

  test("has no axe violations with the mobile menu open", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await gotoSettled(page);
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.locator("#mobile-menu")).toBeVisible();
    const results = await axe(page);
    expect(results.violations).toEqual([]);
  });

  test("reveal content is visible at once under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const reveal = page.locator("[data-reveal]").first();
    await expect(reveal).toHaveCSS("opacity", "1");
    await expect(reveal).toHaveCSS("transform", "none");
  });

  test("web manifest names the business", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest.name).toBe("Study Lab Co");
    expect(manifest.icons.some((i: { sizes: string }) => i.sizes === "512x512")).toBe(true);
  });
});
