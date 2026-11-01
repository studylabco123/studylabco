import { isExpenseCategory, type ExpenseCategory } from "@/lib/money/categories";
import { poundsToPence } from "@/lib/admin/settings-validation";

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ExpenseInput {
  spentOn: string;
  category: ExpenseCategory;
  description: string;
  amountPence: number;
}
export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const bad = (message: string): { ok: false; message: string } => ({ ok: false, message });

function realDate(v: string): boolean {
  if (!DATE.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Form text -> a checked expense. The amount is entered in pounds ("21.50") and never goes through floats. */
export function parseExpense(raw: { date: unknown; category: unknown; description: unknown; amount: unknown }, today: string): Parsed<ExpenseInput> {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const date = str(raw.date);
  if (!realDate(date)) return bad("Choose the date you spent the money.");
  if (date > today) return bad("The date cannot be in the future.");
  if (!isExpenseCategory(raw.category)) return bad("Choose a category.");
  const pence = poundsToPence(str(raw.amount));
  if (pence === null || pence <= 0) return bad("Enter the amount in pounds, like 21.50.");
  const description = str(raw.description);
  if (description.length > 200) return bad("Keep the description under 200 characters.");
  return { ok: true, value: { spentOn: date, category: raw.category, description, amountPence: pence } };
}

const EXT_BY_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** The receipt file: an image or PDF up to 10 MB. The extension comes from the type, never the file name. */
export function checkReceipt(file: { size: number; type: string }): Parsed<{ ext: string }> {
  if (file.size <= 0) return bad("That receipt file is empty.");
  if (file.size > MAX_RECEIPT_BYTES) return bad("The receipt must be 10 MB or smaller.");
  const type = file.type.toLowerCase();
  if (type !== "application/pdf" && !type.startsWith("image/")) return bad("The receipt must be a photo or a PDF.");
  const ext = EXT_BY_TYPE[type] ?? (/^image\/([a-z0-9]{1,8})$/.exec(type)?.[1] ?? "img");
  return { ok: true, value: { ext } };
}

/** "12", "12.5" -> miles with at most one decimal; null if not a sensible distance. */
export function parseMiles(v: unknown): number | null {
  const text = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  const m = /^(\d{1,4})(?:\.(\d))?$/.exec(text);
  if (!m) return null;
  return Number(m[1]) + Number(m[2] ?? 0) / 10;
}
