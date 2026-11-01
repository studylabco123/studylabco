import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/** A layout guard does not protect a server action, so every exported action must start with requireAdmin(). */
const FILES = [
  "src/app/admin/(secure)/bookings/actions.ts",
  "src/app/admin/(secure)/families/actions.ts",
  "src/app/admin/(secure)/calendar/actions.ts",
  "src/app/admin/(secure)/groups/actions.ts",
  "src/app/admin/(secure)/settings/actions.ts",
  "src/app/admin/(secure)/settings/hours/actions.ts",
  "src/app/admin/(secure)/settings/terms/actions.ts",
  "src/app/admin/(secure)/money/actions.ts",
];

describe.each(FILES)("%s", (file) => {
  const src = readFileSync(file, "utf8");
  const fns = [...src.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\n([^\n]*)/g)];
  test("is a server-actions file with actions", () => {
    expect(src.startsWith('"use server"')).toBe(true);
    expect(fns.length).toBeGreaterThan(1);
  });
  test.each(fns.map((m) => [m[1], m[2]]))("%s calls requireAdmin() first", (_name, firstLine) => {
    expect(firstLine.trim()).toBe("await requireAdmin();");
  });
  test("exports only async functions", () => {
    const exports = [...src.matchAll(/^export (?!async function)/gm)];
    expect(exports).toEqual([]);
  });
});

/** Pages and the backup route are reachable directly too: each starts with requireAdmin(). */
const ENTRY_POINTS = [
  "src/app/admin/(secure)/calendar/page.tsx",
  "src/app/admin/(secure)/groups/page.tsx",
  "src/app/admin/(secure)/settings/page.tsx",
  "src/app/admin/(secure)/settings/hours/page.tsx",
  "src/app/admin/(secure)/settings/terms/page.tsx",
  "src/app/admin/(secure)/money/page.tsx",
  "src/app/admin/(secure)/money/tax/page.tsx",
  "src/app/admin/(secure)/families/[id]/page.tsx",
  "src/app/api/admin/backup/route.ts",
  "src/app/api/admin/tax-pack/route.ts",
];

describe.each(ENTRY_POINTS)("%s", (file) => {
  test("calls requireAdmin() before anything else", () => {
    const src = readFileSync(file, "utf8");
    const m = /export default async function \w+\([^)]*\)[^{]*\{\n([^\n]*)|export async function GET\([^)]*\)\s*\{\n([^\n]*)/.exec(src);
    expect((m?.[1] ?? m?.[2] ?? "").trim()).toBe("await requireAdmin();");
  });
});

/** Money actions added in the final fix wave are covered by the checks above; make sure they exist where expected. */
describe("pay from credit (Ruling R23)", () => {
  test("is a guarded booking action", () => {
    const src = readFileSync("src/app/admin/(secure)/bookings/actions.ts", "utf8");
    expect(src).toMatch(/export async function payFromCredit\(bookingId: string\): Promise<AdminResult> \{\n  await requireAdmin\(\);/);
  });
});

describe("late cancellation (V4)", () => {
  test("recordLateCancellation is a guarded booking action", () => {
    const src = readFileSync("src/app/admin/(secure)/bookings/actions.ts", "utf8");
    expect(src).toMatch(/export async function recordLateCancellation\(bookingId: string\): Promise<AdminResult> \{\n  await requireAdmin\(\);/);
  });
});

describe("group passes (V5)", () => {
  test("markPassPaid and convertPassToCredit are guarded money actions", () => {
    const src = readFileSync("src/app/admin/(secure)/money/actions.ts", "utf8");
    expect(src).toMatch(/export async function markPassPaid\(passId: string, method: PaymentMethod\): Promise<AdminResult> \{\n  await requireAdmin\(\);/);
    expect(src).toMatch(/export async function convertPassToCredit\(passId: string\): Promise<AdminResult> \{\n  await requireAdmin\(\);/);
  });

  test("the block actions are gone", () => {
    const src = readFileSync("src/app/admin/(secure)/bookings/actions.ts", "utf8");
    expect(src).not.toMatch(/markBlockPaid|releaseBlock/);
  });
});

describe("credit administration (V6)", () => {
  test("adjustFamilyCredit and refundFamilyCredit are guarded family actions", () => {
    const src = readFileSync("src/app/admin/(secure)/families/actions.ts", "utf8");
    expect(src).toMatch(/export async function adjustFamilyCredit\([^)]*\): Promise<AdminResult> \{\n  await requireAdmin\(\);/);
    expect(src).toMatch(/export async function refundFamilyCredit\([^)]*\): Promise<AdminResult> \{\n  await requireAdmin\(\);/);
  });

  test("the credit-ops module is only reachable from the guarded actions", () => {
    const users = ["src/app/admin/(secure)/families/actions.ts"];
    for (const f of users) expect(readFileSync(f, "utf8")).toContain("@/lib/admin/credit-ops");
  });
});
