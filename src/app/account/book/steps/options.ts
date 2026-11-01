import { assessmentLevel } from "@/lib/booking/level";
import { quote } from "@/lib/booking/pricing";
import { formatPence } from "@/lib/format";
import type { Level } from "@/lib/types";
import type { SessionOption, WizardSettings, WizardType } from "../types";
import { groupPriceText } from "./labels";

// What each level can book, and the price lines (no JSX, so unit tests can import them).

/** Types for an approved child. KS3: no Sunday bundle (Sunday groups are GCSE). Booking with a pass starts from the pass card. */
export function approvedTypes(level: Level): WizardType[] {
  return level === "KS3" ? ["one_to_one", "group", "pass"] : ["one_to_one", "group", "sunday_bundle", "pass"];
}

/** A child only sees group sessions at their own level. */
export function sessionsForLevel(sessions: SessionOption[], level: Level): SessionOption[] {
  return sessions.filter((s) => s.level === level);
}

/** The detail line under each lesson type, priced by `quote` with the child's level. */
export function typeDetails(
  child: { level: Level; schoolYear: number },
  s: WizardSettings,
  levelSessions: SessionOption[],
): Record<WizardType, string> {
  const homeVisit = s.lessonLocations.includes("home_visit");
  const lesson = (type: "assessment" | "one_to_one") => {
    const level = type === "assessment" ? assessmentLevel(child.schoolYear, child.level) : child.level;
    const at = quote({ type, level, location: "tutor_place" }, s).totalPence;
    const home = quote({ type, level, location: "home_visit" }, s).totalPence;
    return `${formatPence(at)}${homeVisit ? ` (home visit ${formatPence(home)})` : ""}`;
  };
  const groupPrice = groupPriceText(levelSessions);
  const pass = (n: 6 | 10) => formatPence(quote({ type: "pass", level: child.level, sessions: n }, s).totalPence);
  return {
    assessment: `60 minutes in person, with a 15-minute talk with you. ${lesson("assessment")}.`,
    one_to_one: `60 minutes, ${lesson("one_to_one")}.`,
    group: groupPrice ? `One 60-minute group session, ${groupPrice}.` : "One 60-minute group session.",
    sunday_bundle: `Both Sunday group sessions on one day, ${formatPence(s.priceSundayBundlePence)}.`,
    pass: `6 ${child.level} group sessions for ${pass(6)}, or 10 for ${pass(10)}. Book them over ${s.passValidityMonths} months.`,
    pass_session: "One group session from your pass.",
  };
}
