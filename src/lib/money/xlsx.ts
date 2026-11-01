import ExcelJS from "exceljs";
import type { TaxPack } from "@/lib/money/tax-pack";

export const FOOTER_NOTE = "Record-keeping aid, not tax advice.";
const MONEY = "£#,##0.00";
const pounds = (pence: number) => pence / 100;

export function packTitle(pack: TaxPack): string {
  const q = pack.range.q;
  return `Study Lab Co tax year ${pack.range.label}${q ? ` quarter ${q}` : ""} (${pack.range.start} to ${pack.range.end})`;
}

function addTable(ws: ExcelJS.Worksheet, headers: string[], rows: (string | number | null)[][], moneyCols: number[], widths: number[]) {
  const head = ws.addRow(headers);
  head.font = { bold: true };
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F2FE" } };
  });
  rows.forEach((r) => ws.addRow(r));
  moneyCols.forEach((c) => (ws.getColumn(c).numFmt = MONEY));
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  if (!rows.length) ws.addRow(["Nothing in this period."]);
}

/** Seven sheets. Money cells hold pounds as numbers with a £ format; all arithmetic happened in pence. */
export async function toXlsx(pack: TaxPack): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Study Lab Co";
  const s = pack.summary;

  const sum = wb.addWorksheet("1. Summary");
  sum.getColumn(1).width = 44;
  sum.getColumn(2).width = 18;
  sum.getColumn(3).width = 60;
  sum.addRow([packTitle(pack)]).font = { bold: true, size: 14 };
  sum.addRow(["For the Self Assessment self-employment pages (cash basis)."]);
  sum.addRow([]);
  const lines: [string, number, string?][] = [
    ["Turnover", s.turnoverPence, "Payments received minus refunds, by date received"],
    ["Expenses", s.expensesPence],
    ["Mileage allowance", s.mileagePence, "45p a mile for the first 10,000 miles of the tax year, 25p after"],
    ["Allowable expenses", s.allowableTotalPence, "Expenses plus mileage allowance"],
    ["Net profit", s.profitPence, "Turnover minus allowable expenses"],
  ];
  for (const [label, pence, note] of lines) {
    const r = sum.addRow([label, pounds(pence), note ?? ""]);
    r.getCell(2).numFmt = MONEY;
    if (label === "Turnover" || label === "Allowable expenses" || label === "Net profit") r.getCell(1).font = { bold: true };
  }
  sum.addRow([]);
  sum.addRow([
    s.tradingAllowanceBetter
      ? "The £1,000 trading allowance may give a better result than claiming these expenses. Check which is better for you."
      : "Claiming these expenses is likely to be better than the £1,000 trading allowance.",
  ]);
  if (pack.missingMilesCount > 0) sum.addRow([`${pack.missingMilesCount} trips have no miles entered and count as nothing.`]);
  sum.addRow([]);
  sum.addRow([FOOTER_NOTE]).font = { italic: true };

  addTable(
    wb.addWorksheet("2. Income"),
    ["Date", "Family", "Method", "Amount"],
    pack.income.map((r) => [r.date, r.detail, r.method, pounds(r.amountPence)]),
    [4],
    [14, 50, 16, 14],
  );
  addTable(
    wb.addWorksheet("3. Monthly"),
    ["Month", "Turnover", "Expenses", "Mileage allowance", "Profit"],
    pack.monthly.map((m) => [m.month, pounds(m.turnoverPence), pounds(m.expensesPence), pounds(m.mileagePence), pounds(m.profitPence)]),
    [2, 3, 4, 5],
    [12, 14, 14, 18, 14],
  );
  addTable(
    wb.addWorksheet("4. Expenses"),
    ["Date", "Category", "Description", "Amount", "Receipt kept"],
    pack.expenses.map((e) => [e.date, e.category, e.description, pounds(e.amountPence), e.receipt ? "Yes" : "No"]),
    [4],
    [14, 24, 44, 14, 14],
  );
  addTable(
    wb.addWorksheet("5. Mileage"),
    ["Date", "Miles", "Allowance", "Note"],
    pack.mileage.map((m) => [m.date, m.miles, pounds(m.amountPence), m.note]),
    [3],
    [14, 10, 14, 50],
  );
  addTable(
    wb.addWorksheet("6. Refunds & waived fees"),
    ["Date", "Type", "Family", "Amount"],
    pack.refundsAndWaivers.map((r) => [r.date, r.label, r.detail, pounds(r.amountPence)]),
    [4],
    [14, 16, 50, 14],
  );
  addTable(
    wb.addWorksheet("7. Unpaid at year end"),
    ["Lesson date", "Type", "Family", "Amount owed"],
    pack.unpaidAtEnd.map((r) => [r.date, r.label, r.detail, pounds(r.amountPence)]),
    [4],
    [14, 20, 50, 14],
  );

  return Buffer.from(await wb.xlsx.writeBuffer());
}
