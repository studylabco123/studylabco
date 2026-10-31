/**
 * E2E helpers. They run in the Playwright (Node) process, so they build their
 * own supabase-js clients from .env.test instead of importing app code
 * (src/lib/supabase/service.ts is server-only and refuses to load here).
 *
 * - createParent(page, overrides?)  signs up through the UI, confirms the email
 *   from the local Mailpit inbox (:54324), then logs in through the UI.
 * - createAdmin()  creates a confirmed user, sets profiles.role = 'admin' and
 *   enrols + verifies a TOTP factor through Supabase's own MFA API (sign in as
 *   the user, mfa.enroll, mfa.challengeAndVerify with a code computed from the
 *   returned secret). Returns the base32 TOTP secret; use totpCode(secret) to
 *   produce codes for the admin MFA screen. No direct SQL on auth.mfa_factors.
 * - seedApprovedChild(parentId)  service-client insert of a child plus an
 *   approved student_status row.
 *
 * Every helper uses unique emails so parallel projects never collide.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";
import { parseEnv } from "node:util";
import { expect, type Page } from "@playwright/test";

function loadTestEnv(): Record<string, string> {
  try {
    return parseEnv(fs.readFileSync(".env.test", "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}
const env = { ...loadTestEnv(), ...process.env } as Record<string, string | undefined>;

function required(name: string): string {
  const v = env[name];
  if (!v) throw new Error(`${name} is not set (expected from .env.test)`);
  return v;
}

const MAILPIT = env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export const POLICY_VERSION = "2026-11-01";

export function serviceClient(): SupabaseClient {
  return createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function anonClient(): SupabaseClient {
  return createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function uniqueEmail(prefix = "parent"): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@example.test`;
}

export interface ParentDetails {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  marketing: boolean;
}

export interface Parent extends ParentDetails {
  id: string;
}

export function parentDetails(overrides: Partial<ParentDetails> = {}): ParentDetails {
  return {
    fullName: "Pat Parent",
    email: uniqueEmail(),
    phone: "07123 456789",
    password: "correct-horse-battery",
    marketing: false,
    ...overrides,
  };
}

/** Fills the sign-up form (consents ticked as asked) without submitting. */
export async function fillSignup(
  page: Page,
  d: ParentDetails,
  consents: { ageGuardian?: boolean; terms?: boolean } = {},
): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(d.fullName);
  await page.getByLabel("Email").fill(d.email);
  await page.getByLabel("Mobile number").fill(d.phone);
  await page.getByLabel("Password", { exact: false }).fill(d.password);
  if (consents.ageGuardian ?? true) await page.getByLabel(/I am 18 or over/).check();
  if (consents.terms ?? true) await page.getByLabel(/I agree to the/).check();
  if (d.marketing) await page.getByLabel(/send me/i).check();
}

/** Newest link containing `needle` in the latest Mailpit message sent to `email`. */
export async function mailLink(email: string, needle = "/auth/v1/verify", timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    for (const m of messages ?? []) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
        Text: string;
        HTML: string;
      };
      const body = `${msg.Text}\n${msg.HTML}`.replace(/&amp;/g, "&");
      const match = body.match(new RegExp(`https?://[^\\s"'<>)]*${needle.replace(/\//g, "\\/")}[^\\s"'<>)]*`));
      if (match) return match[0];
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No email with a "${needle}" link arrived for ${email}`);
}

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

/** Signs up through the UI, confirms the email via Mailpit, then logs in. Ends on /account. */
export async function createParent(page: Page, overrides: Partial<ParentDetails> = {}): Promise<Parent> {
  const d = parentDetails(overrides);
  await fillSignup(page, d);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify/);

  await page.goto(await mailLink(d.email));
  // The confirmation link signs the browser in; start from a clean session so
  // the helper really exercises the login form.
  await page.context().clearCookies();
  await login(page, d.email, d.password);
  await expect(page).toHaveURL(/\/account/);

  const { data, error } = await serviceClient().from("profiles").select("id").eq("email", d.email).single();
  if (error) throw error;
  return { ...d, id: data.id as string };
}

// --- TOTP (RFC 6238, SHA-1, 6 digits, 30 s) -------------------------------------

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of input.replace(/=+$/, "").toUpperCase()) {
    const i = alphabet.indexOf(c);
    if (i < 0) throw new Error("invalid base32");
    bits += i.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpCode(secret: string, atMs: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

export interface Admin {
  id: string;
  email: string;
  password: string;
  totpSecret: string;
}

/** Confirmed admin user with a verified TOTP factor. See the file header for how. */
export async function createAdmin(): Promise<Admin> {
  const service = serviceClient();
  const email = uniqueEmail("admin");
  const password = "admin-password-for-tests";
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Test Admin" },
  });
  if (error) throw error;
  const id = data.user.id;
  const upd = await service.from("profiles").update({ role: "admin" }).eq("id", id);
  if (upd.error) throw upd.error;

  const client = anonClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const enrol = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "e2e" });
  if (enrol.error) throw enrol.error;
  const totpSecret = enrol.data.totp.secret;
  let verified = await client.auth.mfa.challengeAndVerify({ factorId: enrol.data.id, code: totpCode(totpSecret) });
  if (verified.error) {
    // Step boundary crossed between computing and verifying: try the next step.
    verified = await client.auth.mfa.challengeAndVerify({
      factorId: enrol.data.id,
      code: totpCode(totpSecret, Date.now() + 30_000),
    });
  }
  if (verified.error) throw verified.error;
  return { id, email, password, totpSecret };
}

/** A Year 10 child for `parentId` whose assessment is done and who is approved for 1:1 / group lessons. */
export async function seedApprovedChild(parentId: string, firstName = "Alex"): Promise<string> {
  const service = serviceClient();
  const child = await service
    .from("children")
    .insert({
      parent_id: parentId,
      first_name: firstName,
      last_name: "Parent",
      school_year: 10,
      exam_board: "AQA",
      tier: "Higher",
      subjects: ["Combined Science"],
    })
    .select("id")
    .single();
  if (child.error) throw child.error;
  const now = new Date().toISOString();
  const status = await service
    .from("student_status")
    .insert({ child_id: child.data.id, assessment_completed_at: now, approved_at: now });
  if (status.error) throw status.error;
  return child.data.id as string;
}

export async function consentsFor(profileId: string) {
  const { data, error } = await serviceClient()
    .from("consents")
    .select("kind, granted, policy_version")
    .eq("profile_id", profileId)
    .order("kind");
  if (error) throw error;
  return data;
}
