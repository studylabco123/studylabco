import type { Level } from "@/lib/types";

interface ChildLevel {
  schoolYear: number;
  level: Level;
  examBoard: string | null;
  tier: string | null;
}

/** "Year 8, KS3" or "Year 11, GCSE, AQA Higher". KS3 children have no exam board or tier. */
export function childLevelLine(c: ChildLevel): string {
  const base = `Year ${c.schoolYear}, ${c.level}`;
  if (c.level === "KS3") return base;
  const board = [c.examBoard, c.tier].filter(Boolean).join(" ");
  return board ? `${base}, ${board}` : base;
}

/** The short form for calendar titles: "Y11, AQA" for GCSE, "Y8, KS3" for KS3. */
export function childFeedLabel(c: Omit<ChildLevel, "tier">): string {
  return `Y${c.schoolYear}, ${c.level === "GCSE" && c.examBoard ? c.examBoard : c.level}`;
}
