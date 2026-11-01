import ExcelJS from "exceljs";
import { describe, expect, test } from "vitest";
import { buildTaxPack } from "@/lib/money/tax-pack";
import { mileageAllowancePence } from "@/lib/money/tax-year";
import { toPdf } from "@/lib/money/pdf";
import { toXlsx } from "@/lib/money/xlsx";
import type { Booking, Expense, LedgerEntry, MileageEntry } from "@/lib/types";

const at = new Date("2026-11-01T00:00:00Z");
const led = (o: Partial<LedgerEntry>): LedgerEntry => ({
  id: Math.random().toString(36).slice(2), createdAt: at, bookingId: null, blockBookingId: null, passId: null, parentId: null,
  kind: "payment", method: "cash", amountPence: 0, occurredOn: "2026-10-01", note: "", ...o,
});
const exp = (o: Partial<Expense>): Expense => ({
  id: "e" + Math.random(), createdAt: at, spentOn: "2026-11-03", category: "stationery", description: "", amountPence: 0, receiptPath: null, ...o,
});
const mile = (o: Partial<MileageEntry>): MileageEntry => ({
  id: "m" + Math.random(), createdAt: at, bookingId: null, tripOn: "2026-11-04", miles: 0, note: "", ...o,
});
const booking = (o: Partial<Booking> = {}): Booking => ({
  id: "b1", createdAt: at, parentId: "p1", childId: "c", kind: "one_to_one", location: "tutor_place",
  startsAt: new Date("2027-03-01T10:00:00Z"), endsAt: new Date("2027-03-01T11:00:00Z"), busyUntil: new Date("2027-03-01T11:00:00Z"),
  groupSessionId: null, blockBookingId: null, passId: null, feePence: null, bundleId: null, status: "attended", pricePence: 2500, travelFeePence: 0,
  paymentReference: "R", paymentStatus: "unpaid", homeAddress: null, homePostcode: null, cancelledAt: null, cancelledBy: null,
  decidedAt: null, ...o,
});

const range = { label: "2026-27", start: "2026-04-06", end: "2027-04-05" };
const ledger = [
  led({ amountPence: 2500, occurredOn: "2026-10-20" }),
  led({ amountPence: 1800, occurredOn: "2026-10-05" }),
  led({ amountPence: 1000, occurredOn: "2026-11-02" }),
  led({ kind: "refund", amountPence: 1800, occurredOn: "2026-11-10" }),
];
const expenses = [exp({ amountPence: 2150 })];
const mileage = [mile({ miles: 12 })];

describe("buildTaxPack", () => {
  const pack = buildTaxPack(range, ledger, [], expenses, mileage);
  test("turnover 3500", () => expect(pack.summary.turnoverPence).toBe(3500));
  test("mileage 540", () => expect(pack.summary.mileagePence).toBe(540));
  test("expenses 2150", () => expect(pack.summary.expensesPence).toBe(2150));
  test("allowable 2690", () => expect(pack.summary.allowableTotalPence).toBe(2690));
  test("profit 810", () => expect(pack.summary.profitPence).toBe(810));
  test("tradingAllowanceBetter true", () => expect(pack.summary.tradingAllowanceBetter).toBe(true));
  test("trading allowance not better at 1000 pounds", () => {
    const p = buildTaxPack(range, ledger, [], [exp({ amountPence: 100000 })], []);
    expect(p.summary.tradingAllowanceBetter).toBe(false);
  });
  test("income rows sorted by date", () => {
    expect(pack.income.map((r) => r.date)).toEqual(["2026-10-05", "2026-10-20", "2026-11-02"]);
  });
  test("payment dated 2027-04-06 excluded from 2026-27", () => {
    const p = buildTaxPack(range, [...ledger, led({ amountPence: 9999, occurredOn: "2027-04-06" })], [], expenses, mileage);
    expect(p.summary.turnoverPence).toBe(3500);
  });
  test("payment dated 2026-04-05 excluded, 2026-04-06 and 2027-04-05 included", () => {
    const l = [
      led({ amountPence: 100, occurredOn: "2026-04-05" }),
      led({ amountPence: 200, occurredOn: "2026-04-06" }),
      led({ amountPence: 400, occurredOn: "2027-04-05" }),
    ];
    expect(buildTaxPack(range, l, [], [], []).summary.turnoverPence).toBe(600);
  });
  test("refunds, credits and waivers are listed but credits and waivers are not income", () => {
    const l = [...ledger, led({ kind: "credit", amountPence: 700, occurredOn: "2026-11-11" }), led({ kind: "waiver", amountPence: 300, occurredOn: "2026-11-12" })];
    const p = buildTaxPack(range, l, [], [], []);
    expect(p.summary.turnoverPence).toBe(3500);
    expect(p.refundsAndWaivers.map((r) => r.label)).toEqual(["Refund", "Credit issued", "Waived fee"]);
  });
  test("credit issued and credit applied never change turnover; sheet 6 lists both (R23)", () => {
    const l = [
      ...ledger,
      led({ kind: "credit", amountPence: 2500, occurredOn: "2026-11-11", parentId: "p1" }),
      led({ kind: "credit_applied", amountPence: 2500, occurredOn: "2026-11-20", parentId: "p1", bookingId: "b9", note: "Paid from credit" }),
    ];
    const p = buildTaxPack(range, l, [], [], []);
    expect(p.summary.turnoverPence).toBe(3500);
    expect(p.income).toHaveLength(3);
    expect(p.refundsAndWaivers.map((r) => [r.label, r.amountPence])).toEqual([
      ["Refund", 1800],
      ["Credit issued", 2500],
      ["Credit applied", 2500],
    ]);
    expect(p.monthly.find((m) => m.month === "2026-11")?.turnoverPence).toBe(1000 - 1800);
  });
  test("a lesson paid from credit is not unpaid at year end", () => {
    const b = booking({ id: "b9", startsAt: new Date("2026-12-01T10:00:00Z"), paymentStatus: "paid" });
    const l = [led({ kind: "credit_applied", amountPence: 2500, occurredOn: "2026-11-20", bookingId: "b9" })];
    expect(buildTaxPack(range, l, [b], [], []).unpaidAtEnd).toEqual([]);
  });
  test("monthly rows cover each month of the range", () => {
    expect(pack.monthly).toHaveLength(13);
    const nov = pack.monthly.find((m) => m.month === "2026-11");
    expect(nov).toMatchObject({ turnoverPence: 1000 - 1800, expensesPence: 2150, mileagePence: 540 });
    expect(pack.monthly[0].month).toBe("2026-04");
    expect(pack.monthly[12].month).toBe("2027-04");
  });
  test("expenses outside the range are left out", () => {
    const p = buildTaxPack(range, [], [], [exp({ spentOn: "2027-04-06", amountPence: 500 }), exp({ amountPence: 100 })], []);
    expect(p.expenses).toHaveLength(1);
    expect(p.summary.expensesPence).toBe(100);
  });
  test("mileage with no miles is listed with a note and contributes nothing", () => {
    const p = buildTaxPack(range, [], [], [], [mile({ miles: null }), mile({ miles: 10 })]);
    expect(p.summary.mileagePence).toBe(450);
    expect(p.mileage.find((m) => m.miles === null)?.note).toContain("miles not entered");
    expect(p.missingMilesCount).toBe(1);
  });
  test("mileage rate drops to 25p after 10,000 miles across the tax year", () => {
    const p = buildTaxPack(range, [], [], [], [mile({ tripOn: "2026-05-01", miles: 9990 }), mile({ tripOn: "2026-06-01", miles: 20 })]);
    expect(p.summary.mileagePence).toBe(mileageAllowancePence(10010));
    expect(p.mileage.map((m) => m.amountPence)).toEqual([449550, 700]);
  });
  test("a quarter continues the cumulative miles of earlier quarters", () => {
    const q2 = { label: "2026-27", start: "2026-07-06", end: "2026-10-05" };
    const m = [mile({ tripOn: "2026-05-01", miles: 9990 }), mile({ tripOn: "2026-08-01", miles: 20 })];
    const p = buildTaxPack(q2, [], [], [], m);
    expect(p.mileage).toHaveLength(1);
    expect(p.summary.mileagePence).toBe(700);
  });
  test("unpaid at year end uses owed semantics: late cancel is price only", () => {
    const bs = [
      booking({ id: "a", status: "late_cancelled", location: "home_visit", travelFeePence: 500, startsAt: new Date("2027-02-01T10:00:00Z") }),
      booking({ id: "b", status: "attended", travelFeePence: 500, startsAt: new Date("2027-02-02T10:00:00Z") }),
      booking({ id: "c", paymentStatus: "paid" }),
      booking({ id: "d", status: "attended", startsAt: new Date("2027-04-20T10:00:00Z") }),
    ];
    const p = buildTaxPack(range, [led({ bookingId: "c", occurredOn: "2027-03-02" })], bs, [], []);
    expect(p.unpaidAtEnd.map((r) => r.amountPence).sort()).toEqual([2500, 3000]);
  });
  test("a booking owed on 5 April 2027 and paid on 20 April is unpaid at the end of 2026-27 only", () => {
    const b = booking({ id: "x", paymentStatus: "paid", startsAt: new Date("2027-03-20T10:00:00Z") });
    const l = [led({ bookingId: "x", occurredOn: "2027-04-20" })];
    expect(buildTaxPack(range, l, [b], [], []).unpaidAtEnd.map((r) => r.amountPence)).toEqual([2500]);
    const next = { label: "2027-28", start: "2027-04-06", end: "2028-04-05" };
    expect(buildTaxPack(next, l, [b], [], []).unpaidAtEnd).toEqual([]);
  });
  test("a payment, waiver or credit on the booking, its bundle or its block settles it", () => {
    const bs = [
      booking({ id: "w" }),
      booking({ id: "b1", bundleId: "bun" }),
      booking({ id: "b2", bundleId: "bun" }),
      booking({ id: "k", blockBookingId: "blk" }),
      booking({ id: "r" }),
    ];
    const l = [
      led({ bookingId: "w", kind: "waiver", occurredOn: "2027-03-02" }),
      led({ bookingId: "b1", occurredOn: "2027-03-02" }),
      led({ blockBookingId: "blk", occurredOn: "2027-03-02" }),
      led({ bookingId: "r", kind: "refund", occurredOn: "2027-03-02" }),
    ];
    expect(buildTaxPack(range, l, bs, [], []).unpaidAtEnd).toHaveLength(1);
  });
  test("names are looked up for rows", () => {
    const p = buildTaxPack(range, [led({ parentId: "p1", amountPence: 5, occurredOn: "2026-10-01" })], [], [], [], new Map([["p1", "Jo Bloggs"]]));
    expect(p.income[0].detail).toContain("Jo Bloggs");
  });
});

describe("mileageAllowancePence", () => {
  test("10010 miles = 450250", () => expect(mileageAllowancePence(10010)).toBe(450250));
  test("12 miles = 540", () => expect(mileageAllowancePence(12)).toBe(540));
  test("tenths of a mile", () => expect(mileageAllowancePence(0.1)).toBe(5));
  test("0 miles", () => expect(mileageAllowancePence(0)).toBe(0));
});

describe("exports", () => {
  const pack = buildTaxPack(range, ledger, [], expenses, mileage);
  test("xlsx has 7 sheets in order", async () => {
    const buf = await toXlsx(pack);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "1. Summary", "2. Income", "3. Monthly", "4. Expenses", "5. Mileage", "6. Refunds, credits & waivers", "7. Unpaid at year end",
    ]);
    const s = wb.getWorksheet("1. Summary")!;
    const cells: unknown[] = [];
    s.eachRow((r) => r.eachCell((c) => cells.push(c.value)));
    expect(cells).toContain("Turnover");
    expect(cells).toContain("Allowable expenses");
    expect(cells).toContain("Net profit");
    expect(cells).toContain(35);
    expect(cells.some((c) => typeof c === "string" && c.includes("Record-keeping aid, not tax advice."))).toBe(true);
  });
  test("pdf is a one-page pdf", async () => {
    const bytes = await toPdf(pack);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
