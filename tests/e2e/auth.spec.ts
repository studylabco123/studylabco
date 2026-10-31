import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  consentsFor,
  createAdmin,
  createParent,
  fillSignup,
  parentDetails,
  seedApprovedChild,
  serviceClient,
  totpCode,
} from "./helpers";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function profileByEmail(email: string) {
  const { data } = await serviceClient().from("profiles").select("*").eq("email", email).maybeSingle();
  return data;
}

test.describe("parent authentication", () => {
  test("checkboxes start unticked", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByLabel(/I am 18 or over and the parent or legal guardian of the child I'm booking for/)).not.toBeChecked();
    await expect(page.getByLabel(/I agree to the/)).not.toBeChecked();
    await expect(page.getByLabel(/send me/i)).not.toBeChecked();
  });

  test("terms label links to the terms and refund policy", async ({ page }) => {
    await page.goto("/signup");
    const label = page.locator("label", { hasText: "I agree to the" });
    await expect(label.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    await expect(label.getByRole("link", { name: "Refund Policy" })).toHaveAttribute("href", "/refunds");
  });

  test("signup requires both mandatory consents", async ({ page }) => {
    const d = parentDetails();
    await fillSignup(page, d, { ageGuardian: false, terms: false });
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Please confirm you are 18 or over and the parent or legal guardian")).toBeVisible();
    await expect(page.getByText("Please agree to the Terms and Refund Policy to continue")).toBeVisible();
    await expect(page).toHaveURL(/\/signup/);
    expect(await profileByEmail(d.email)).toBeNull();
  });

  test("rejects phone 12345", async ({ page }) => {
    const d = parentDetails({ phone: "12345" });
    await fillSignup(page, d);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter a UK mobile number")).toBeVisible();
    expect(await profileByEmail(d.email)).toBeNull();
  });

  test("rejects a short password", async ({ page }) => {
    const d = parentDetails({ password: "short" });
    await fillSignup(page, d);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Use at least 10 characters")).toBeVisible();
  });

  test("signup → verify email → login → lands on /account", async ({ page }) => {
    const parent = await createParent(page, { fullName: "Riley Parent" });
    await expect(page.getByRole("heading", { name: "Welcome, Riley Parent" })).toBeVisible();
    const profile = await profileByEmail(parent.email);
    expect(profile).toMatchObject({ full_name: "Riley Parent", phone: "07123456789", role: "parent" });
  });

  test("login is refused until the email is confirmed", async ({ page }) => {
    const d = parentDetails();
    await fillSignup(page, d);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/verify/);
    await page.goto("/login");
    await page.getByLabel("Email").fill(d.email);
    await page.getByLabel("Password").fill(d.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText(/confirm your email/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("consents stored with policy version 2026-11-01", async ({ page }) => {
    const parent = await createParent(page, { marketing: true });
    const consents = await consentsFor(parent.id);
    expect(consents).toEqual([
      { kind: "age_guardian", granted: true, policy_version: "2026-11-01" },
      { kind: "marketing", granted: true, policy_version: "2026-11-01" },
      { kind: "terms", granted: true, policy_version: "2026-11-01" },
    ]);
    expect((await profileByEmail(parent.email))?.marketing_opt_in).toBe(true);
  });

  test("marketing consent is recorded as not granted when unticked", async ({ page }) => {
    const parent = await createParent(page);
    const consents = await consentsFor(parent.id);
    expect(consents.find((c) => c.kind === "marketing")).toMatchObject({ granted: false });
    expect((await profileByEmail(parent.email))?.marketing_opt_in).toBe(false);
  });

  test("/account redirects to /login when signed out", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
  });

  test("login honours a same-site next path and ignores external ones", async ({ page }) => {
    const parent = await createParent(page);
    await page.context().clearCookies();
    await page.goto("/login?next=https://evil.example/");
    await page.getByLabel("Email").fill(parent.email);
    await page.getByLabel("Password").fill(parent.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/localhost:3000\/account$/);
  });

  test("wrong password shows an error", async ({ page }) => {
    const parent = await createParent(page);
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(parent.email);
    await page.getByLabel("Password").fill("not-the-password-1");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Email or password is incorrect")).toBeVisible();
  });

  test("sign out returns to the home page and protects /account again", async ({ page }) => {
    await createParent(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/localhost:3000\/$/);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login/);
  });

  test("password reset by email", async ({ page }) => {
    const parent = await createParent(page);
    await page.context().clearCookies();
    await page.goto("/reset");
    await page.getByLabel("Email").fill(parent.email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/we.ve sent a link/i)).toBeVisible();
    const { mailLink } = await import("./helpers");
    await page.goto(await mailLink(parent.email, "/auth/v1/verify"));
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
    await page.getByLabel("New password").fill("a-brand-new-password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL(/\/account/);
    await page.context().clearCookies();
    const { login } = await import("./helpers");
    await login(page, parent.email, "a-brand-new-password");
    await expect(page).toHaveURL(/\/account/);
  });

  for (const path of ["/signup", "/login", "/reset", "/verify?email=a%40example.test"]) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test("signup form with errors has no axe violations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await fillSignup(page, parentDetails({ phone: "1" }), { ageGuardian: false, terms: false });
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter a UK mobile number")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("e2e helpers", () => {
  test("createAdmin returns a working TOTP secret and admin role", async () => {
    const admin = await createAdmin();
    expect(admin.totpSecret).toMatch(/^[A-Z2-7]+$/);
    const { data } = await serviceClient().from("profiles").select("role").eq("id", admin.id).single();
    expect(data?.role).toBe("admin");
    const { data: factors } = await serviceClient().auth.admin.mfa.listFactors({ userId: admin.id });
    expect(factors?.factors.some((f) => f.factor_type === "totp" && f.status === "verified")).toBe(true);
    expect(totpCode(admin.totpSecret)).toMatch(/^\d{6}$/);
  });

  test("seedApprovedChild creates an approved child", async ({ page }) => {
    const parent = await createParent(page);
    const childId = await seedApprovedChild(parent.id);
    const { data } = await serviceClient().from("student_status").select("approved_at").eq("child_id", childId).single();
    expect(data?.approved_at).not.toBeNull();
  });
});
