import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createParent, seedChild, serviceClient } from "./helpers";

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
    await expect(page.getByText("Year 11, GCSE, AQA Higher: Chemistry")).toBeVisible();
    const { data } = await serviceClient().from("children").select("*").eq("parent_id", parent.id).single();
    expect(data).toMatchObject({ school_year: 11, level: "GCSE", exam_board: "AQA", tier: "Higher", subjects: ["Chemistry"], target_grade: null });
  });

  test("school year offers Years 7 to 11 and is required", async ({ page }) => {
    await createParent(page);
    await page.goto("/account/children/new");
    const options = await page.getByLabel("School year").locator("option").allTextContents();
    expect(options.slice(1)).toEqual(["Year 7", "Year 8", "Year 9", "Year 10", "Year 11"]);
    await page.getByRole("button", { name: "Save child" }).click();
    await expect(page.getByText("Choose a school year from Year 7 to Year 11")).toBeVisible();
    await expect(page.getByText("Choose at least one subject")).toBeVisible();
  });

  test("add Year 8 child shows no exam board and saves KS3", async ({ page }) => {
    const parent = await createParent(page);
    await page.goto("/account/children/new");
    await page.getByLabel("First name").fill("Kay");
    await page.getByLabel("Last name").fill("Parent");
    await page.getByLabel("School year").selectOption("8");
    await expect(page.getByLabel("Exam board")).toHaveCount(0);
    await expect(page.getByLabel("Tier")).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "GCSE" })).toHaveCount(0);
    await page.getByLabel("Combined Science").check();
    await page.getByRole("button", { name: "Save child" }).click();
    await expect(page).toHaveURL(/\/account\/children$/);
    await expect(page.getByText("Year 8, KS3: Combined Science")).toBeVisible();
    const { data } = await serviceClient().from("children").select("*").eq("parent_id", parent.id).single();
    expect(data).toMatchObject({ school_year: 8, level: "KS3", exam_board: null, tier: null });
  });

  test("Year 9 requires choosing KS3 or GCSE", async ({ page }) => {
    const parent = await createParent(page);
    await page.goto("/account/children/new");
    await page.getByLabel("First name").fill("Nia");
    await page.getByLabel("Last name").fill("Parent");
    await page.getByLabel("School year").selectOption("9");
    await page.getByLabel("Physics").check();
    await page.getByRole("button", { name: "Save child" }).click();
    await expect(page.getByText("Choose KS3 or GCSE")).toBeVisible();

    // GCSE needs a board and tier; KS3 does not.
    await page.getByRole("radio", { name: "GCSE" }).check();
    await expect(page.getByLabel("Exam board")).toBeVisible();
    await page.getByRole("button", { name: "Save child" }).click();
    await expect(page.locator('[id$="-error"]').filter({ hasText: "Choose an exam board" })).toBeVisible();
    await page.getByRole("radio", { name: /^KS3/ }).check();
    await expect(page.getByLabel("Exam board")).toHaveCount(0);
    await page.getByRole("button", { name: "Save child" }).click();
    await expect(page).toHaveURL(/\/account\/children$/);
    await expect(page.getByText("Year 9, KS3: Physics")).toBeVisible();
    const { data } = await serviceClient().from("children").select("*").eq("parent_id", parent.id).single();
    expect(data).toMatchObject({ school_year: 9, level: "KS3", exam_board: null, tier: null });
  });

  test("Change level moves a Year 9 child to GCSE and leaves bookings alone", async ({ page }) => {
    const parent = await createParent(page);
    const id = await seedChild(parent.id, { firstName: "Nia", ks3: true, schoolYear: 9 });
    const service = serviceClient();
    const at = new Date(Date.now() + 20 * 86_400_000);
    const { error } = await service.from("bookings").insert({
      parent_id: parent.id,
      child_id: id,
      kind: "assessment",
      location: "tutor_place",
      starts_at: at.toISOString(),
      ends_at: new Date(at.getTime() + 3_600_000).toISOString(),
      busy_until: new Date(at.getTime() + 3_600_000).toISOString(),
      status: "confirmed",
      price_pence: 1000,
    });
    if (error) throw error;
    try {
      await page.goto("/account/children");
      await expect(page.getByText("Year 9, KS3: Combined Science")).toBeVisible();
      await page.getByRole("link", { name: "Change level for Nia Parent" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Change level" })).toBeVisible();
      await expect(page.getByText(/Existing bookings stay as they are/)).toBeVisible();
      await page.getByRole("radio", { name: "GCSE" }).check();
      await page.getByLabel("Exam board").selectOption("OCR");
      await page.getByLabel("Tier").selectOption("Foundation");
      await page.getByRole("button", { name: "Save level" }).click();
      await expect(page).toHaveURL(/\/account\/children$/);
      await expect(page.getByText("Year 9, GCSE, OCR Foundation: Combined Science")).toBeVisible();
      const { data: child } = await service.from("children").select("level, exam_board, tier").eq("id", id).single();
      expect(child).toEqual({ level: "GCSE", exam_board: "OCR", tier: "Foundation" });
      const { data: bookings } = await service.from("bookings").select("price_pence, status").eq("child_id", id);
      expect(bookings).toEqual([{ price_pence: 1000, status: "confirmed" }]);
    } finally {
      await service.from("bookings").delete().eq("child_id", id);
    }
  });

  test("another parent cannot open the Change level page", async ({ page, browser }) => {
    const owner = await createParent(page);
    const id = await seedChild(owner.id, { ks3: true });
    const other = await browser.newPage();
    await createParent(other);
    const res = await other.goto(`/account/children/${id}/level`);
    expect(res?.status()).toBe(404);
    await other.close();
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
    await page.getByLabel("School year").selectOption("9");
    await page.getByRole("radio", { name: "GCSE" }).check();
    await scan();
    await page.goto("/account/children");
    await page.getByRole("link", { name: /^Change level/ }).click();
    await scan();
    await page.goto("/account/children");
    await openAgreement(page);
    await scan();
    await page.getByRole("button", { name: "Sign agreement" }).click();
    await expect(page.getByText("Enter an emergency contact name")).toBeVisible();
    await scan();
  });
});
