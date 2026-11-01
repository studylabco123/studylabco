import { formatPence } from "@/lib/format";

/** The banner text for ?cancelled=free|late&fee=<pence>, or null for anything else. */
export function cancelNoticeText(cancelled: string | undefined, fee: string | undefined, lateFeePercent: number): string | null {
  if (cancelled === "free") return "Booking cancelled.";
  if (cancelled !== "late") return null;
  const pence = /^\d{1,7}$/.test(fee ?? "") ? Number(fee) : null;
  const amount = pence === null ? `${lateFeePercent}% of the lesson price` : formatPence(pence);
  return `Booking cancelled. A late cancellation fee of ${amount} is now due.`;
}

/** Confirmation banner after a cancellation, driven by ?cancelled=free|late&fee=<pence>. Display only. */
export function CancelNotice({ cancelled, fee, lateFeePercent }: { cancelled?: string; fee?: string; lateFeePercent: number }) {
  const text = cancelNoticeText(cancelled, fee, lateFeePercent);
  if (!text) return null;
  return (
    <p role="status" className="rounded-card bg-success-50 p-4 text-success-700">
      {text}
    </p>
  );
}
