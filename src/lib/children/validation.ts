import { z } from "zod";
import { normalisePhone, UK_MOBILE } from "@/lib/auth/validation";
import type { Level } from "@/lib/types";

export const SCHOOL_YEARS = [7, 8, 9, 10, 11] as const;
export const LEVELS = ["KS3", "GCSE"] as const;
export const EXAM_BOARDS = ["AQA", "Edexcel", "OCR", "WJEC/Eduqas"] as const;
export const TIERS = ["Foundation", "Higher"] as const;
export const SUBJECTS = ["Biology", "Chemistry", "Physics", "Combined Science"] as const;
export const TARGET_GRADES = ["9", "8", "7", "6", "5", "4", "3", "2", "1", "U"] as const;

/** Emergency contacts may be a UK mobile or a UK landline (0 then 9 or 10 digits), spaces ignored. */
const UK_LANDLINE = /^0\d{9,10}$/;
export function isUkPhone(raw: string): boolean {
  const p = normalisePhone(raw);
  return UK_MOBILE.test(p) || UK_LANDLINE.test(p);
}

/** Trim, collapse inner whitespace, lower-case: for comparing a typed name with the profile name. */
export function normaliseName(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

const schoolYear = z
  .string()
  .pipe(z.enum(["7", "8", "9", "10", "11"], { error: "Choose a school year from Year 7 to Year 11" }))
  .transform((v) => Number(v) as (typeof SCHOOL_YEARS)[number]);

/** Fields every form sends as text; empty means "not chosen". */
const levelFields = {
  school_year: schoolYear,
  level: z.string().optional(),
  exam_board: z.string().optional(),
  tier: z.string().optional(),
};

const EXAM_BOARD_SET: readonly string[] = EXAM_BOARDS;
const TIER_SET: readonly string[] = TIERS;

/**
 * Resolves the level from the year (Years 7-8 KS3, 10-11 GCSE, Year 9 the
 * parent's choice) and requires a board and tier only for GCSE. KS3 children
 * never keep a board or tier, whatever was sent.
 */
function resolveLevel<T extends { school_year: number; level?: string; exam_board?: string; tier?: string }>(
  v: T,
  ctx: z.RefinementCtx,
) {
  const { level: chosen, exam_board, tier, ...rest } = v;
  let level: Level;
  if (v.school_year <= 8) level = "KS3";
  else if (v.school_year >= 10) level = "GCSE";
  else if (chosen === "KS3" || chosen === "GCSE") level = chosen;
  else {
    ctx.addIssue({ code: "custom", path: ["level"], message: "Choose KS3 or GCSE" });
    return z.NEVER;
  }
  if (level === "KS3") return { ...rest, level, exam_board: null, tier: null };
  let bad = false;
  if (!exam_board || !EXAM_BOARD_SET.includes(exam_board)) {
    ctx.addIssue({ code: "custom", path: ["exam_board"], message: "Choose an exam board" });
    bad = true;
  }
  if (!tier || !TIER_SET.includes(tier)) {
    ctx.addIssue({ code: "custom", path: ["tier"], message: "Choose Foundation or Higher" });
    bad = true;
  }
  if (bad) return z.NEVER;
  return { ...rest, level, exam_board: exam_board as (typeof EXAM_BOARDS)[number], tier: tier as (typeof TIERS)[number] };
}

export const childSchema = z
  .object({
    first_name: z.string().trim().min(1, "Enter your child's first name"),
    last_name: z.string().trim().min(1, "Enter your child's last name"),
    ...levelFields,
    subjects: z
      .array(z.enum(SUBJECTS))
      .min(1, "Choose at least one subject")
      .transform((a) => [...new Set(a)]),
    target_grade: z
      .string()
      .optional()
      .transform((v) => (v ? v : null))
      .pipe(z.enum(TARGET_GRADES).nullable()),
  })
  .transform(resolveLevel);

/** "Change level" on an existing child: year, level, and board/tier for GCSE. */
export const childLevelSchema = z.object(levelFields).transform(resolveLevel);
export type ChildLevelInput = z.infer<typeof childLevelSchema>;
export type ChildInput = z.infer<typeof childSchema>;

export const agreementSchema = z.object({
  emergency_contact_name: z.string().trim().min(1, "Enter an emergency contact name"),
  emergency_contact_phone: z
    .string()
    .refine(isUkPhone, "Enter a UK phone number, like 07123 456789 or 01632 960123")
    .transform(normalisePhone),
  medical_info: z.string().trim().max(2000, "Please keep this under 2000 characters").transform((v) => v || null),
  sen_info: z.string().trim().max(2000, "Please keep this under 2000 characters").transform((v) => v || null),
  consent_contact: z.literal("on", { error: "Please tick to say we can contact you by phone and email" }),
  agree: z.literal("on", { error: "Please tick to agree" }),
  signed_name: z.string().trim().min(1, "Type your full name to sign"),
});
