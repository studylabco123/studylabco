import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/** A layout guard does not protect a server action, so every exported action must start with requireAdmin(). */
const FILES = [
  "src/app/admin/(secure)/bookings/actions.ts",
  "src/app/admin/(secure)/families/actions.ts",
];

describe.each(FILES)("%s", (file) => {
  const src = readFileSync(file, "utf8");
  const fns = [...src.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\n([^\n]*)/g)];
  test("is a server-actions file with actions", () => {
    expect(src.startsWith('"use server"')).toBe(true);
    expect(fns.length).toBeGreaterThan(3);
  });
  test.each(fns.map((m) => [m[1], m[2]]))("%s calls requireAdmin() first", (_name, firstLine) => {
    expect(firstLine.trim()).toBe("await requireAdmin();");
  });
  test("exports only async functions", () => {
    const exports = [...src.matchAll(/^export (?!async function)/gm)];
    expect(exports).toEqual([]);
  });
});
