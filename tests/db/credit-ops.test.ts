/** Admin credit adjustments and credit refunds (V6) against the local Supabase stack. */
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { adjustCredit, refundCredit } from "@/lib/admin/credit-ops";
import { buildTaxPack } from "@/lib/money/tax-pack";
import { mapLedger } from "@/lib/supabase/mappers";
import { closeDb, createUser, db, resetData } from "./setup";

const NOW = new Date("2026-11-10T23:30:00Z"); // 23:30 GMT, London date 2026-11-10
let parentId: string;

const balance = async () => (await db.query("select credit_balance($1) as n", [parentId])).rows[0].n as number;
const entries = async () => {
  const { rows } = await db.query(
    "select id, created_at::text, booking_id, block_booking_id, pass_id, parent_id, kind::text, method::text, amount_pence, to_char(occurred_on,'YYYY-MM-DD') as occurred_on, note from ledger order by created_at, id",
  );
  return rows.map((r) => mapLedger(r as never));
};
const RANGE = { label: "2026-27", start: "2026-04-06", end: "2027-04-05" };
const ledger = async () =>
  (await db.query("select kind::text, method::text, amount_pence, note, to_char(occurred_on,'YYYY-MM-DD') as on, booking_id from ledger order by created_at")).rows;

beforeEach(async () => {
  await resetData();
  parentId = (await createUser()).id;
});
afterAll(closeDb);

describe("adjustCredit", () => {
  test("add credit 500 → balance 500", async () => {
    expect(await adjustCredit(parentId, 500, "add", "Goodwill after a missed lesson", { now: NOW })).toEqual({ ok: true });
    expect(await balance()).toBe(500);
    expect(await ledger()).toEqual([
      expect.objectContaining({ kind: "credit", amount_pence: 500, on: "2026-11-10", note: expect.stringContaining("Goodwill after a missed lesson") }),
    ]);
  });

  test("remove credit above balance refused", async () => {
    await adjustCredit(parentId, 500, "add", "Start", { now: NOW });
    expect(await adjustCredit(parentId, 600, "remove", "Too much", { now: NOW })).toEqual({
      ok: false,
      message: "That's more than the £5 credit on this account.",
    });
    expect(await balance()).toBe(500);
  });

  test("remove 200 → balance 300", async () => {
    await adjustCredit(parentId, 500, "add", "Start", { now: NOW });
    expect(await adjustCredit(parentId, 200, "remove", "Entered twice", { now: NOW })).toEqual({ ok: true });
    expect(await balance()).toBe(300);
    expect((await ledger())[1]).toMatchObject({ kind: "credit_applied", amount_pence: 200 });
  });

  test("reason is required (1 to 200 characters) and the amount must be positive", async () => {
    expect((await adjustCredit(parentId, 500, "add", "   ", { now: NOW })).ok).toBe(false);
    expect((await adjustCredit(parentId, 500, "add", "x".repeat(201), { now: NOW })).ok).toBe(false);
    expect((await adjustCredit(parentId, 0, "add", "Zero", { now: NOW })).ok).toBe(false);
    expect((await adjustCredit(parentId, 1.5, "add", "Float", { now: NOW })).ok).toBe(false);
    expect((await adjustCredit("not-a-uuid", 500, "add", "Bad id", { now: NOW })).ok).toBe(false);
    expect(await ledger()).toEqual([]);
  });

  test("two removals racing for the same balance: one is refused", async () => {
    await adjustCredit(parentId, 500, "add", "Start", { now: NOW });
    const results = await Promise.all([
      adjustCredit(parentId, 400, "remove", "Race A", { now: NOW }),
      adjustCredit(parentId, 400, "remove", "Race B", { now: NOW }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    expect(await balance()).toBe(100);
  });

  test("adjustments excluded from turnover and listed on sheet 6", async () => {
    await adjustCredit(parentId, 500, "add", "Goodwill", { now: NOW });
    await adjustCredit(parentId, 200, "remove", "Correction", { now: NOW });
    const pack = buildTaxPack(RANGE, await entries(), [], [], []);
    expect(pack.summary.turnoverPence).toBe(0);
    expect(pack.refundsAndWaivers.map((r) => r.label)).toEqual(["Credit added by tutor", "Credit removed by tutor"]);
  });
});

describe("refundCredit", () => {
  test("refund credit 300 → balance 0, ledger refund 300", async () => {
    await adjustCredit(parentId, 300, "add", "Start", { now: NOW });
    expect(await refundCredit(parentId, 300, "bank_transfer", { now: NOW })).toEqual({ ok: true });
    expect(await balance()).toBe(0);
    expect((await ledger()).slice(1)).toEqual([
      expect.objectContaining({ kind: "refund", method: "bank_transfer", amount_pence: 300, on: "2026-11-10" }),
      expect.objectContaining({ kind: "credit_applied", amount_pence: 300 }),
    ]);
  });

  test("refund is capped at the balance", async () => {
    await adjustCredit(parentId, 300, "add", "Start", { now: NOW });
    const r = await refundCredit(parentId, 400, "cash", { now: NOW });
    expect(r).toEqual({ ok: false, message: "That's more than the £3 credit on this account." });
    expect(await balance()).toBe(300);
    expect(await ledger()).toHaveLength(1);
  });

  test("a refund reduces turnover", async () => {
    await db.query("insert into ledger (parent_id, kind, method, amount_pence, occurred_on) values ($1,'payment','cash',1000,'2026-11-01')", [parentId]);
    await adjustCredit(parentId, 300, "add", "Start", { now: NOW });
    await refundCredit(parentId, 300, "cash", { now: NOW });
    const pack = buildTaxPack(RANGE, await entries(), [], [], []);
    expect(pack.summary.turnoverPence).toBe(700);
  });
});
