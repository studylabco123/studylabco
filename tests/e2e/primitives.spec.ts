import { expect, test } from "@playwright/test";

// Uses the dev-only harness at /test-harness/primitives (notFound() in production).
const HARNESS = "/test-harness/primitives";

test.describe("UI primitives", () => {
  test("dialog moves focus inside, closes on Escape and returns focus", async ({ page }) => {
    await page.goto(HARNESS);
    const opener = page.getByRole("button", { name: "Open dialog" });
    await opener.click();

    const dialog = page.getByRole("dialog", { name: "Cancel this lesson?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription("A late cancellation fee applies.");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("toast is announced in a live region and can be dismissed", async ({ page }) => {
    await page.goto(HARNESS);
    const region = page.getByRole("status");
    await expect(region).toHaveAttribute("aria-live", "polite");
    await expect(region).toBeEmpty();

    await page.getByRole("button", { name: "Show toast" }).click();
    await expect(region).toContainText("Booking saved");

    await region.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(region).not.toContainText("Booking saved");
  });

  test("reveal starts hidden and fades in when scrolled into view", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(HARNESS);
    const reveal = page.locator("[data-reveal]", { has: page.locator("#reveal-target") });

    await expect(reveal).toHaveCSS("opacity", "0");
    await expect(reveal).not.toHaveAttribute("data-revealed");

    await reveal.scrollIntoViewIfNeeded();
    await expect(reveal).toHaveAttribute("data-revealed");
    await expect(reveal).toHaveCSS("opacity", "1");
    await expect(reveal).toHaveCSS("transform", "none");
  });
});
