import { describe, expect, test } from "vitest";
import { KIND_LABEL, parseResult, percent, RESULT_PATH, scoreLine } from "@/lib/results/validation";

const ok = { title: "Cells test", kind: "end_of_topic", takenOn: "2026-10-20", score: "34", outOf: "50", grade: "6", wentWell: "Good recall", toImprove: "Show working" };
const today = "2026-11-01";

describe("percent", () => {
  test("rounds to an integer", () => {
    expect(percent(34, 50)).toBe(68);
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(0, 10)).toBe(0);
  });
  test("scoreLine reads 34 / 50 (68%)", () => expect(scoreLine(34, 50)).toBe("34 / 50 (68%)"));
});

describe("parseResult", () => {
  test("accepts a good result", () => {
    const r = parseResult(ok, today);
    expect(r).toEqual({ ok: true, value: { title: "Cells test", kind: "end_of_topic", takenOn: "2026-10-20", score: 34, outOf: 50, grade: "6", wentWell: "Good recall", toImprove: "Show working" } });
  });
  test("a blank grade is null", () => expect(parseResult({ ...ok, grade: "  " }, today)).toMatchObject({ ok: true, value: { grade: null } }));
  test.each([
    ["empty title", { title: " " }],
    ["long title", { title: "x".repeat(121) }],
    ["bad kind", { kind: "mock" }],
    ["future date", { takenOn: "2026-11-02" }],
    ["fake date", { takenOn: "2026-02-31" }],
    ["score above out of", { score: "51" }],
    ["negative score", { score: "-1" }],
    ["decimal score", { score: "3.5" }],
    ["zero out of", { outOf: "0" }],
    ["long grade", { grade: "x".repeat(21) }],
    ["empty went well", { wentWell: "" }],
    ["empty to improve", { toImprove: "  " }],
    ["long feedback", { wentWell: "x".repeat(2001) }],
  ])("rejects %s", (_n, patch) => expect(parseResult({ ...ok, ...patch }, today).ok).toBe(false));
});

test("labels", () => {
  expect(KIND_LABEL).toEqual({ initial_assessment: "Initial assessment", end_of_topic: "End-of-topic test", other: "Other" });
});

test("RESULT_PATH only accepts results/YYYY/uuid.ext", () => {
  const id = "0b9f3c1e-5a2d-4e7f-9c3b-1a2b3c4d5e6f";
  expect(RESULT_PATH.test(`results/2026/${id}.jpg`)).toBe(true);
  expect(RESULT_PATH.test(`receipts/2026/${id}.jpg`)).toBe(false);
  expect(RESULT_PATH.test(`results/2026/../${id}.jpg`)).toBe(false);
  expect(RESULT_PATH.test(`results/2026/${id}.svg`)).toBe(false);
});
