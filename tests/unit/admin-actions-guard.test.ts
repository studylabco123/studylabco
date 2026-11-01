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
