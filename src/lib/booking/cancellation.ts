/** Parents cancelling inside the notice window are 'late'; tutor cancellations are always 'free'. */
export function cancellationOutcome(
  startsAt: Date,
  now: Date,
  noticeHours: number,
  by: "parent" | "tutor",
): "free" | "late" {
  if (by === "tutor") return "free";
  return startsAt.getTime() - now.getTime() >= noticeHours * 3600_000 ? "free" : "late";
}
