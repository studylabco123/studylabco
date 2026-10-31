import { londonDateOf } from "@/lib/time";
import type { GroupProduct, GroupSession } from "@/lib/types";

export type BlockPlan =
  | { ok: true; sessionIds: string[] }
  | { ok: false; fullDate: string }
  | { ok: false; notEnoughWeeks: true };

/**
 * Picks the sessions for a group block. `sessions` are the product's sessions
 * (the caller filters by series); a "week" is one London date: one Saturday
 * session, or both Sunday sessions for `sunday_bundle`. Starting at
 * `firstDate`, weeks with a cancelled (or missing) session are skipped, so the
 * block extends to the next scheduled week. A week with a full session
 * rejects the whole block, naming that date.
 */
export function planBlock(
  sessions: GroupSession[],
  seatsLeft: Record<string, number>,
  product: GroupProduct,
  weeks: number,
  firstDate: string,
): BlockPlan {
  const perWeek = product === "sunday_bundle" ? 2 : 1;
  const byDate = new Map<string, GroupSession[]>();
  for (const s of [...sessions].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    const date = londonDateOf(s.startsAt);
    if (date < firstDate) continue;
    byDate.set(date, [...(byDate.get(date) ?? []), s]);
  }

  const sessionIds: string[] = [];
  let taken = 0;
  for (const [date, day] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (taken === weeks) break;
    const scheduled = day.filter((s) => s.status === "scheduled");
    if (scheduled.length < perWeek) continue;
    const week = scheduled.slice(0, perWeek);
    if (week.some((s) => (seatsLeft[s.id] ?? 0) <= 0)) return { ok: false, fullDate: date };
    sessionIds.push(...week.map((s) => s.id));
    taken++;
  }
  return taken === weeks ? { ok: true, sessionIds } : { ok: false, notEnoughWeeks: true };
}
