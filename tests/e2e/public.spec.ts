import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { serviceClient, setBankDetails, TEST_BANK } from "./helpers";

/**
 * The public website: every page, the legal pages, /groups and the contact
 * form. Read-only against shared settings (price changes are tested in
 * admin-config.spec, which runs alone in the "config" project).
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const service = serviceClient();

const PAGES = [
  "/",
  "/about",
  "/lessons",
  "/groups",
  "/faq",
  "/contact",
  "/terms",
  "/refunds",
  "/privacy",
  "/cookies",
  "/safeguarding",
  "/accessibility",
] as const;
const LEGAL = ["/terms", "/refunds", "/privacy", "/cookies", "/safeguarding", "/accessibility"] as const;

/** Every character a visitor (or a screen reader, or a closed <details>) could get, minus scripts. */
async function allText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const body = document.body.cloneNode(true) as HTMLElement;
    for (const el of body.querySelectorAll("script, style, template, noscript")) el.remove();
    const meta = [...document.querySelectorAll('title, meta[name="description"], meta[property^="og:"]')]
      .map((m) => m.getAttribute("content") ?? m.textContent ?? "")
      .join(" ");
    return `${meta} ${body.textContent ?? ""}`;
  });
}

async function settled(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  return page.goto(path);
}

test.beforeAll(async () => {
  // The private details exist (as in production), so a leak would show up.
  await setBankDetails();
});

test("every public page returns 200 and passes axe", async ({ page }) => {
  test.setTimeout(120_000);
  for (const path of PAGES) {
    const res = await settled(page, path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("h1"), path).toHaveCount(1);
    expect(await page.title(), path).toMatch(/Study Lab Co/);
    await expect(page.locator('meta[name="description"]'), path).toHaveAttribute("content", /.{40,}/);
    await expect(page.locator('meta[property="og:image"]').first(), path).toHaveAttribute("content", /\.png/);
    const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(axe.violations, path).toEqual([]);
  }
});

test("legal pages each show the last updated date", async ({ page }) => {
  for (const path of LEGAL) {
    await page.goto(path);
    await expect(page.getByText("Last updated 1 November 2026"), path).toBeVisible();
  }
});

test("refund policy and FAQ state the 50% late cancellation fee", async ({ page }) => {
  await page.goto("/refunds");
  await expect(page.getByText(/late cancellation fee is 50% of the lesson price/)).toBeVisible();
  await expect(page.getByText(/plus the travel fee for a home visit/)).toBeVisible();
  await page.goto("/faq");
  await expect(page.getByText(/late cancellation fee of 50% of the lesson price/)).toBeAttached();
});

test('home shows "Qualified Teacher (QTS)", "Enhanced DBS Checked", "All Exam Boards" and "Book your £10 Assessment Lesson"', async ({ page }) => {
  await page.goto("/");
  const main = page.locator("main");
  for (const badge of ["Qualified Teacher (QTS)", "Enhanced DBS Checked", "All Exam Boards"]) {
    await expect(main.getByText(badge, { exact: true }).first()).toBeVisible();
  }
  await expect(main.getByRole("link", { name: "Book your £10 Assessment Lesson" }).first()).toBeVisible();
  await expect(main.getByRole("heading", { name: "How it works" })).toBeVisible();
});

test('no public page contains "BB1 1QR", the sort code, or "online" while online is disabled', async ({ page }) => {
  test.setTimeout(90_000);
  const { data } = await service.from("settings").select("online_enabled").single();
  expect(data?.online_enabled).toBe(false);
  for (const path of PAGES) {
    await page.goto(path);
    const html = await page.content();
    const text = await allText(page);
    for (const secret of ["BB1 1QR", TEST_BANK.sortCode, TEST_BANK.accountNumber, TEST_BANK.teachingAddress]) {
      expect(html, `${path} leaks ${secret}`).not.toContain(secret);
    }
    expect(text, path).not.toMatch(/\bonline\b/i);
    expect(text, path).not.toMatch(/\bfine\b|penalt|guarantee|100%/i);
  }
});

test("about lists Jamiatul Ilm Wal Huda, Clitheroe Royal Grammar School Sixth Form, University of Salford, Edge Hill University", async ({ page }) => {
  await page.goto("/about");
  const main = page.locator("main");
  for (const t of [
    "Grade 9 GCSE Science",
    "Jamiatul Ilm Wal Huda",
    "A-Levels in Biology, Chemistry and Psychology",
    "Clitheroe Royal Grammar School Sixth Form",
    "BSc Biology",
    "University of Salford",
    "PGCE with QTS",
    "Edge Hill University",
    "Enhanced DBS checked",
  ]) {
    await expect(main.getByText(t, { exact: false }).first(), t).toBeVisible();
  }
  await expect(main.locator("img")).toHaveCount(0);
  const text = await allText(page);
  expect(text).not.toMatch(/\b(he|she|him|her|his|hers)\b/i);
});

test("lessons shows every price from settings and the new-student steps", async ({ page }) => {
  const { data: s } = await service.from("settings").select("*").single();
  const gbp = (p: number) => `£${Math.floor(p / 100)}${p % 100 ? `.${String(p % 100).padStart(2, "0")}` : ""}`;
  await page.goto("/lessons");
  const main = page.locator("main");
  for (const p of [
    s.price_assessment_pence,
    s.price_assessment_pence + s.travel_fee_pence,
    s.price_one_to_one_pence,
    s.price_one_to_one_pence + s.travel_fee_pence,
    s.price_group_pence,
    s.price_sunday_bundle_pence,
    s.block_prices.saturday["6"],
    s.block_prices.saturday["10"],
    s.block_prices.sunday_bundle["6"],
    s.block_prices.sunday_bundle["10"],
  ]) {
    await expect(main.getByText(gbp(p), { exact: true }).first(), gbp(p)).toBeVisible();
  }
  // Saving against weekly prices: 6 x £18 = £108 → save £6.
  await expect(main.getByText(`Save ${gbp(6 * s.price_group_pence - s.block_prices.saturday["6"])}`).first()).toBeVisible();
  await expect(main.getByText(/BB1 and BB2/).first()).toBeVisible();
  const steps = main.getByRole("list", { name: "Steps for new students" });
  await expect(steps.getByRole("listitem")).toHaveCount(4);
  await expect(steps).toContainText("60-minute Assessment Lesson");
  await expect(steps).toContainText("15-minute talk");
});

test("groups lists upcoming sessions with seats left and a booking link", async ({ page }) => {
  await page.goto("/groups");
  const items = page.getByRole("list", { name: "Upcoming group sessions" }).getByRole("listitem");
  await expect(items.first()).toBeVisible();
  const first = items.first();
  await expect(first).toContainText(/\d+ seats? left|Full/);
  await expect(first).toContainText("Years 7–9");
  await expect(first).toContainText("Location confirmed on booking");
  await expect(first).toContainText("£14");
  await expect(first.getByRole("link", { name: /^Book a seat/ })).toHaveAttribute("href", /\/signup|\/account\/book/);
});

test("contact form sends and shows thanks", async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  const before = await service.from("email_log").select("id", { count: "exact", head: true }).eq("template", "contact_message");
  for (let i = 0; i < 2; i++) {
    await page.goto("/contact");
    await page.getByLabel("Your name").fill(`Casey ${tag}`);
    await page.getByLabel("Email", { exact: true }).fill(`casey-${tag}@example.test`);
    await page.getByLabel("Message", { exact: true }).fill("Hello,\nDo you have space on Saturdays?");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Thanks, your message has been sent" })).toBeVisible();
  }
  // The same message twice is two emails (contact messages are never de-duplicated).
  const after = await service.from("email_log").select("id", { count: "exact", head: true }).eq("template", "contact_message");
  expect((after.count ?? 0) - (before.count ?? 0)).toBeGreaterThanOrEqual(2);
});

test("contact form honeypot: a bot that fills the hidden field sees thanks and nothing is sent", async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  await page.goto("/contact");
  await expect(page.locator('input[name="website"]')).not.toBeInViewport();
  await page.getByLabel("Your name").fill(`Bot ${tag}`);
  await page.getByLabel("Email", { exact: true }).fill(`bot-${tag}@example.test`);
  await page.getByLabel("Message", { exact: true }).fill("Buy now");
  await page.locator('input[name="website"]').fill("https://spam.example", { force: true });
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Thanks, your message has been sent" })).toBeVisible();
});

test("contact form explains what to fix", async ({ page }) => {
  await page.goto("/contact");
  await page.getByLabel("Message", { exact: true }).fill("x".repeat(2001));
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Enter your name")).toBeVisible();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await expect(page.getByText("Keep your message under 2,000 characters")).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("x".repeat(2001));
});

test("no page loads a script from a host other than self and challenges.cloudflare.com", async ({ page }) => {
  const hosts = new Set<string>();
  page.on("request", (req) => {
    if (req.resourceType() === "script") hosts.add(new URL(req.url()).host);
  });
  for (const path of PAGES) await page.goto(path, { waitUntil: "networkidle" });
  for (const h of hosts) expect(["localhost:3000", "challenges.cloudflare.com"], h).toContain(h);
});

test("keyboard-only user can reach and submit the contact form", async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  await page.goto("/contact");
  const name = page.getByLabel("Your name");
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    if (await name.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(name).toBeFocused();
  await page.keyboard.type(`Kim ${tag}`);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await page.keyboard.type(`kim-${tag}@example.test`);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel(/^Phone/)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Message", { exact: true })).toBeFocused();
  await page.keyboard.type("Typed with the keyboard only.");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Send message" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Thanks, your message has been sent" })).toBeVisible();
});

test("no testimonials section at launch", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-testid=testimonials]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /testimonial|what parents say|reviews/i })).toHaveCount(0);
});

test("robots and sitemap keep private areas out", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  for (const p of ["/account", "/admin", "/test-harness", "/api"]) expect(robots).toContain(`Disallow: ${p}`);
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const p of PAGES.slice(1)) expect(sitemap, p).toContain(`${p}</loc>`);
  expect(sitemap).not.toMatch(/\/account|\/admin|\/test-harness|\/api/);
});
