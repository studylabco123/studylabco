import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createParent, serviceClient } from "./helpers";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function addChild(page: Page, first = "Sam") {
  await page.goto("/account/children/new");
  await page.getByLabel("First name").fill(first);
  await page.getByLabel("Last name").fill("Parent");
  await page.getByLabel("School year").selectOption("11");
  await page.getByLabel("Exam board").selectOption("AQA");
  await page.getByLabel("Tier").selectOption("Higher");
  await page.getByLabel("Chemistry").check();
  await page.getByRole("button", { name: "Save child" }).click();
  await expect(page).toHaveURL(/\/account\/children$/);
}

async function childId(parentId: string): Promise<string> {
  const { data, error } = await serviceClient().from("children").select("id").eq("parent_id", parentId).single();
  if (error) throw error;
  return data.id;
}

async function openAgreement(page: Page) {
  await page.getByRole("link", { name: "Sign agreement" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Parent/Guardian Agreement & Consent Form" })).toBeVisible();
}

async function fillAgreement(page: Page, signedName: string, medical = "") {
  await page.getByLabel("Emergency contact name").fill("Gran Parent");
  await page.getByLabel("Emergency contact phone").fill("01632 960123");
  if (medical) await page.getByLabel(/Medical information/).fill(medical);
  await page.getByLabel(/may contact me by phone and email/).check();
  await page.getByLabel(/I have read and agree/).check();
  await page.getByLabel("Type your full name to sign").fill(signedName);
  await page.getByRole("button", { name: "Sign agreement" }).click();
}

test.describe("children and agreement", () => {
  test("add child Year 11 AQA Higher Chemistry", async ({ page }) => {
    const parent = await createParent(page);
    await addChild(page);
    await expect(page.getByText("Sam Parent")).toBeVisible();
    await expect(page.getByText("Year 11, AQA Higher: Chemistry")).toBeVisible();
    const { data } = await serviceClient().from("children").select("*").eq("parent_id", parent.id).single();
    expect(data).toMatchObject({ school_year: 11, exam_board: "AQA", tier: "Higher", subjects: ["Chemistry"], target_grade: null });
  });

  test("cannot choose Year 9", async ({ page }) => {
    await createParent(page);
    await page.goto("/account/children/new");
    const options = await page.getByLabel("School year").locator("option").allTextContents();
    expect(options.join(" ")).not.toContain("Year 9");
    await page.getByRole("button", { name: "Save child" }).click();
    await expect(page.getByText("Choose Year 10 or Year 11")).toBeVisible();
    await expect(page.getByText("Choose at least one subject")).toBeVisible();
  });

  test("agreement rejects mismatched signature name", async ({ page }) => {
    const parent = await createParent(page);
    await addChild(page);
    await openAgreement(page);
    await fillAgreement(page, "Somebody Else");
    await expect(page.getByText("Type your name exactly as it appears on your account")).toBeVisible();
    const { data } = await serviceClient().from("agreements").select("id").eq("child_id", await childId(parent.id));
    expect(data).toEqual([]);
  });

  test("agreement saved shows Signed on date, and cannot be signed twice", async ({ page }) => {
    const parent = await createParent(page);
    await addChild(page);
    await openAgreement(page);
    await fillAgreement(page, "  pat   PARENT ");
    await expect(page.getByRole("heading", { name: /^Signed on \d{1,2} \w+ \d{4}$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign agreement" })).toHaveCount(0);
    const { data } = await serviceClient().from("agreements").select("*").eq("child_id", await childId(parent.id)).single();
    expect(data).toMatchObject({ policy_version: "2026-11-01", consent_contact: true, emergency_contact_phone: "01632960123" });
    await page.goto("/account/children");
    await expect(page.getByText("Agreement signed")).toBeVisible();
  });

  test("medical notes shown back to the parent but not on any public page", async ({ page }) => {
    await createParent(page);
    await addChild(page);
    await openAgreement(page);
    await fillAgreement(page, "Pat Parent", "Peanut allergy xyzzy");
    await expect(page.getByText("Peanut allergy xyzzy")).toBeVisible();
    await page.context().clearCookies();
    for (const path of ["/", "/terms", "/refunds", "/privacy", "/signup"]) {
      await page.goto(path);
      await expect(page.locator("body")).not.toContainText("xyzzy");
    }
  });

  test("another parent cannot open the agreement page", async ({ page, browser }) => {
    const owner = await createParent(page);
    await addChild(page);
    const id = await childId(owner.id);
    const other = await browser.newPage();
    await createParent(other);
    const res = await other.goto(`/account/children/${id}/agreement`);
    expect(res?.status()).toBe(404);
    await other.close();
  });

  test("pages have no axe violations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await createParent(page);
    await addChild(page);
    const scan = async () => expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);
    await scan();
    await page.goto("/account/children/new");
    await page.getByRole("button", { name: "Save child" }).click();
    await expect(page.getByText("Choose at least one subject")).toBeVisible();
    await scan();
    await page.goto("/account/children");
    await openAgreement(page);
    await scan();
    await page.getByRole("button", { name: "Sign agreement" }).click();
    await expect(page.getByText("Enter an emergency contact name")).toBeVisible();
    await scan();
  });
});
