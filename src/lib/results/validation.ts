import { EXT_BY_TYPE, MAX_RECEIPT_BYTES, type Parsed } from "@/lib/money/validation";

export type ResultKind = "initial_assessment" | "end_of_topic" | "other";
export const RESULT_KINDS: readonly ResultKind[] = ["initial_assessment", "end_of_topic", "other"];
export const KIND_LABEL: Record<ResultKind, string> = {
  initial_assessment: "Initial assessment",
  end_of_topic: "End-of-topic test",
  other: "Other",
};
export const isResultKind = (v: unknown): v is ResultKind => typeof v === "string" && (RESULT_KINDS as readonly string[]).includes(v);

export const RESULT_BUCKET = "results";

/** results/YYYY/<uuid>.<ext>, the only object keys a result may point at. */
export const RESULT_PATH = /^results\/\d{4}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic|heif|pdf)$/;

/** Whole-number percentage, rounded. */
export function percent(score: number, outOf: number): number {
  return Math.round((score / outOf) * 100);
}
/** "34 / 50 (68%)" */
export const scoreLine = (score: number, outOf: number) => `${score} / ${outOf} (${percent(score, outOf)}%)`;

export interface ResultInput {
  title: string;
  kind: ResultKind;
  takenOn: string;
  score: number;
  outOf: number;
  grade: string | null;
  wentWell: string;
  toImprove: string;
}

const bad = (message: string): { ok: false; message: string } => ({ ok: false, message });
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function realDate(v: string): boolean {
  if (!DATE.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
const whole = (v: unknown): number | null => {
  const t = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  return /^\d{1,6}$/.test(t) ? Number(t) : null;
};

/** Form text -> a checked result. `today` is the London date; a test cannot be taken in the future. */
export function parseResult(
  raw: { title: unknown; kind: unknown; takenOn: unknown; score: unknown; outOf: unknown; grade: unknown; wentWell: unknown; toImprove: unknown },
  today: string,
): Parsed<ResultInput> {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const title = str(raw.title);
  if (!title || title.length > 120) return bad("Give the result a title of up to 120 characters.");
  if (!isResultKind(raw.kind)) return bad("Choose the type of test.");
  const takenOn = str(raw.takenOn);
  if (!realDate(takenOn)) return bad("Choose the date the test was taken.");
  if (takenOn > today) return bad("The date cannot be in the future.");
  const score = whole(raw.score);
  const outOf = whole(raw.outOf);
  if (outOf === null || outOf <= 0) return bad("Enter the marks available as a whole number above 0.");
  if (score === null) return bad("Enter the score as a whole number, 0 or more.");
  if (score > outOf) return bad("The score cannot be more than the marks available.");
  const grade = str(raw.grade);
  if (grade.length > 20) return bad("Keep the grade under 20 characters.");
  const wentWell = str(raw.wentWell);
  const toImprove = str(raw.toImprove);
  if (!wentWell || wentWell.length > 2000) return bad("Write what went well (up to 2000 characters).");
  if (!toImprove || toImprove.length > 2000) return bad("Write what to improve (up to 2000 characters).");
  return { ok: true, value: { title, kind: raw.kind, takenOn, score, outOf, grade: grade || null, wentWell, toImprove } };
}

/** The attachment: a photo or PDF up to 10 MB (same rule as receipts). The extension comes from the type. */
export function checkAttachment(file: { size: number; type: string }): Parsed<{ ext: string }> {
  if (file.size <= 0) return bad("That file is empty.");
  if (file.size > MAX_RECEIPT_BYTES) return bad("The file must be 10 MB or smaller.");
  const ext = EXT_BY_TYPE[file.type.toLowerCase()];
  if (!ext) return bad("The attachment must be a photo or a PDF.");
  return { ok: true, value: { ext } };
}
