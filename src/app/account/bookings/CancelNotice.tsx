import { formatPence } from "@/lib/format";

/** Confirmation banner after a cancellation, driven by ?cancelled=free|late&fee=<pence>. Display only. */
export function CancelNotice({ cancelled, fee }: { cancelled?: string; fee?: string }) {
  if (cancelled !== "free" && cancelled !== "late") return null;
  const pence = /^\d{1,7}$/.test(fee ?? "") ? Number(fee) : null;
  return (
    <p role="status" className="rounded-card bg-success-50 p-4 text-success-700">
      {cancelled === "late"
        ? `Booking cancelled. A late cancellation fee of ${pence === null ? "the lesson price" : formatPence(pence)} is now due.`
        : "Booking cancelled."}
    </p>
  );
}
