import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { anonClient, createAdmin, createParent, login, serviceClient, totpCode, uniqueEmail } from "./helpers";

/** Logs in and waits for the redirect, so the session cookie is set before the next navigation. */
async function logInAs(page: import("@playwright/test").Page, email: string, password: string) {
  await login(page, email, password);
  // Admins land on /admin, which sends them on to the 2-step code screen.
  await expect(page).toHaveURL(/\/admin\/mfa$/, { timeout: 20_000 });
}

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Types a code into the 6-digit field and submits. */
async function submitCode(page: import("@playwright/test").Page, code: string) {
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
}

test.describe("admin access", () => {
  test("signed-out visitor to /admin is sent to log in", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
  });

  test("parent visiting /admin is sent to /account", async ({ page }) => {
    await createParent(page);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/account$/);
  });

  test("admin login lands on the 2-step screen, and an explicit next still wins", async ({ page }) => {
    const admin = await createAdmin();
    await login(page, admin.email, admin.password);
    await expect(page).toHaveURL(/\/admin\/mfa$/, { timeout: 20_000 });
    await page.context().clearCookies();
    await page.goto("/login?next=/account/settings");
    await page.getByLabel("Email").fill(admin.email);
    await page.getByLabel("Password").fill(admin.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/account\/settings$/);
  });

  test("admin without code is sent to /admin/mfa", async ({ page }) => {
    const admin = await createAdmin();
    await logInAs(page, admin.email, admin.password);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/mfa$/);
    await expect(page.getByLabel("6-digit code")).toBeVisible();
  });

  test("admin with valid TOTP reaches Today", async ({ page }) => {
    const admin = await createAdmin();
    await logInAs(page, admin.email, admin.password);
    await page.goto("/admin/mfa");
    await submitCode(page, totpCode(admin.totpSecret));
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Calendar" })).toBeVisible();
    await page.goto("/admin/mfa");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("wrong code shows error", async ({ page }) => {
    const admin = await createAdmin();
    await logInAs(page, admin.email, admin.password);
    await page.goto("/admin/mfa");
    const right = totpCode(admin.totpSecret);
    await submitCode(page, right === "000000" ? "111111" : "000000");
    await expect(page.getByText("That code didn't work. Please try again.")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/mfa$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/mfa$/);
  });

  test("admin sign out ends the session", async ({ page }) => {
    const admin = await createAdmin();
    await logInAs(page, admin.email, admin.password);
    await page.goto("/admin/mfa");
    await submitCode(page, totpCode(admin.totpSecret));
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/localhost:3000\/$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("admin with no authenticator is shown enrolment, then verifies", async ({ page }) => {
    const service = serviceClient();
    const email = uniqueEmail("admin");
    const password = "admin-password-for-tests";
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    await service.from("profiles").update({ role: "admin" }).eq("id", data.user.id);

    await logInAs(page, email, password);
    await page.goto("/admin/mfa");
    await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
    const secret = (await page.getByTestId("totp-secret").textContent())!.replace(/\s+/g, "");
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
    await submitCode(page, totpCode(secret));
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  });

  test("admin pages have no axe violations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const admin = await createAdmin();
    await logInAs(page, admin.email, admin.password);
    await page.goto("/admin/mfa");
    let results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
    await submitCode(page, totpCode(admin.totpSecret));
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("password alone cannot add a second authenticator and reach aal2", async () => {
    const admin = await createAdmin();
    const attacker = anonClient();
    const signedIn = await attacker.auth.signInWithPassword({ email: admin.email, password: admin.password });
    expect(signedIn.error).toBeNull();

    // The attacker has only a password (aal1) and tries to enrol their own factor.
    const enrol = await attacker.auth.mfa.enroll({ factorType: "totp", friendlyName: "attacker" });
    if (!enrol.error) {
      const secret = enrol.data.totp.secret;
      const verified = await attacker.auth.mfa.challengeAndVerify({ factorId: enrol.data.id, code: totpCode(secret) });
      expect(verified.error).not.toBeNull();
    }

    const { data: aal } = await attacker.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aal?.currentLevel).not.toBe("aal2");
    const read = await attacker.from("settings_private").select("*");
    expect(read.data ?? []).toEqual([]);

    // The real admin factor is unaffected and still the only verified one.
    const { data: factors } = await serviceClient().auth.admin.mfa.listFactors({ userId: admin.id });
    expect(factors?.factors.filter((f) => f.status === "verified")).toHaveLength(1);
  });
});
