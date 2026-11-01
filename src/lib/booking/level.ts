import type { Level } from "@/lib/types";

/**
 * A child's key stage: Years 7-8 are KS3, Years 10-11 are GCSE, and Year 9 is
 * chosen by the parent (GCSE if they have not chosen).
 */
export function levelFor(schoolYear: number, chosen?: Level | null): Level {
  if (schoolYear <= 8) return "KS3";
  if (schoolYear === 9) return chosen ?? "GCSE";
  return "GCSE";
}

/** The Assessment Lesson level: Year 9 always sits the GCSE assessment. */
export function assessmentLevel(schoolYear: number, level: Level): Level {
  return schoolYear === 9 ? "GCSE" : level;
}
