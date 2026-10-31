import { z } from "zod";
import { normalisePhone, UK_MOBILE } from "@/lib/auth/validation";

export const SCHOOL_YEARS = [10, 11] as const;
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

export const childSchema = z.object({
  first_name: z.string().trim().min(1, "Enter your child's first name"),
  last_name: z.string().trim().min(1, "Enter your child's last name"),
  school_year: z
    .string()
    .pipe(z.enum(["10", "11"], { error: "Choose Year 10 or Year 11" }))
    .transform((v) => Number(v) as 10 | 11),
  exam_board: z.enum(EXAM_BOARDS, { error: "Choose an exam board" }),
  tier: z.enum(TIERS, { error: "Choose Foundation or Higher" }),
  subjects: z
    .array(z.enum(SUBJECTS))
    .min(1, "Choose at least one subject")
    .transform((a) => [...new Set(a)]),
  target_grade: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.enum(TARGET_GRADES).nullable()),
});
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
