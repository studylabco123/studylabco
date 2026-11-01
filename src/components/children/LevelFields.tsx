"use client";

import { useState } from "react";
import { SelectField } from "@/components/ui/Field";
import { EXAM_BOARDS, SCHOOL_YEARS, TIERS } from "@/lib/children/validation";

export interface LevelValues {
  school_year: string;
  level: string;
  exam_board: string;
  tier: string;
}

export type LevelErrors = Partial<Record<keyof LevelValues, string>>;

/** KS3 for Years 7-8, GCSE for 10-11, the parent's choice for Year 9 (null until chosen). */
function resolved(year: string, level: string): "KS3" | "GCSE" | null {
  const y = Number(year);
  if (!year) return null;
  if (y <= 8) return "KS3";
  if (y >= 10) return "GCSE";
  return level === "KS3" || level === "GCSE" ? level : null;
}

/**
 * School year, the Year 9 "Studying for" choice, and exam board and tier
 * (shown and required only for GCSE). Shared by Add child and Change level.
 */
export function LevelFields({ initial, errors }: { initial?: Partial<LevelValues>; errors: LevelErrors }) {
  const [year, setYear] = useState(initial?.school_year ?? "");
  const [level, setLevel] = useState(initial?.level ?? "");
  const current = resolved(year, level);
  // Before a year is picked the board and tier are shown, so nothing jumps in for most parents.
  const showBoard = current === "GCSE" || !year;
  const radio = "size-5 shrink-0 accent-navy-900";

  return (
    <>
      <SelectField
        label="School year"
        name="school_year"
        value={year}
        onChange={(e) => setYear(e.target.value)}
        error={errors.school_year}
        required
      >
        <option value="" disabled>
          Choose a year
        </option>
        {SCHOOL_YEARS.map((y) => (
          <option key={y} value={String(y)}>
            Year {y}
          </option>
        ))}
      </SelectField>

      {year === "9" ? (
        <fieldset className="flex flex-col gap-1" aria-describedby={errors.level ? "level-error" : "level-hint"}>
          <legend className="font-display text-small font-medium">Studying for</legend>
          <p id="level-hint" className="text-fine text-navy-600">
            Year 9 students can work at KS3 level or start GCSE. You can change this later.
          </p>
          {(
            [
              ["KS3", "KS3 (Years 7–9 level)"],
              ["GCSE", "GCSE"],
            ] as const
          ).map(([value, text]) => (
            <label key={value} className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="level"
                value={value}
                className={radio}
                checked={level === value}
                onChange={() => setLevel(value)}
              />
              {text}
            </label>
          ))}
          {errors.level ? (
            <p id="level-error" className="text-small font-semibold text-danger-700">
              {errors.level}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {showBoard ? (
        <>
          <SelectField label="Exam board" name="exam_board" defaultValue={initial?.exam_board ?? ""} error={errors.exam_board} required>
            <option value="" disabled>
              Choose an exam board
            </option>
            {EXAM_BOARDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </SelectField>
          <SelectField label="Tier" name="tier" defaultValue={initial?.tier ?? ""} error={errors.tier} required>
            <option value="" disabled>
              Choose a tier
            </option>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </SelectField>
        </>
      ) : null}
    </>
  );
}
