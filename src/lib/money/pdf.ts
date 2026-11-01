import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { TaxPack } from "@/lib/money/tax-pack";
import { FOOTER_NOTE, packTitle } from "@/lib/money/xlsx";

/** Standard PDF fonts only cover Latin-1; anything else becomes '?'. */
const safe = (t: string) => t.replace(/[^ -~ -ÿ]/g, "?");
const money = (p: number) => {
  const abs = Math.abs(p);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+$)/g, ",");
  return `${p < 0 ? "-" : ""}\u00a3${whole}.${String(abs % 100).padStart(2, "0")}`;
};

/** A one-page summary of the pack. */
export async function toPdf(pack: TaxPack): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.06, 0.12, 0.25);
  let y = 780;
  const text = (t: string, x: number, size = 11, f = font) => page.drawText(safe(t), { x, y, size, font: f, color: ink });

  text("Study Lab Co", 50, 20, bold);
  y -= 26;
  text(packTitle(pack), 50, 11);
  y -= 16;
  text("For the Self Assessment self-employment pages (cash basis).", 50, 10);
  y -= 36;

  const s = pack.summary;
  const rows: [string, number, boolean][] = [
    ["Turnover", s.turnoverPence, true],
    ["Expenses", s.expensesPence, false],
    ["Mileage allowance", s.mileagePence, false],
    ["Allowable expenses", s.allowableTotalPence, true],
    ["Net profit", s.profitPence, true],
  ];
  for (const [label, pence, strong] of rows) {
    text(label, 50, 13, strong ? bold : font);
    const v = money(pence);
    page.drawText(v, { x: 545 - (strong ? bold : font).widthOfTextAtSize(v, 13), y, size: 13, font: strong ? bold : font, color: ink });
    y -= 22;
  }
  y -= 14;
  text(
    s.tradingAllowanceBetter
      ? "The 1,000 pound trading allowance may be better than claiming these expenses."
      : "Claiming these expenses is likely to beat the 1,000 pound trading allowance.",
    50,
    10,
  );
  y -= 16;
  text(`Income entries: ${pack.income.length}   Expense entries: ${pack.expenses.length}   Trips: ${pack.mileage.length}`, 50, 10);
  y -= 16;
  if (pack.missingMilesCount > 0) {
    text(`${pack.missingMilesCount} trips have no miles entered and count as nothing.`, 50, 10);
    y -= 16;
  }
  const unpaid = pack.unpaidAtEnd.reduce((n, r) => n + r.amountPence, 0);
  text(`Unpaid at the end of the period: ${money(unpaid)} (${pack.unpaidAtEnd.length} lessons)`, 50, 10);

  page.drawText(FOOTER_NOTE, { x: 50, y: 40, size: 9, font, color: ink });
  return doc.save();
}
