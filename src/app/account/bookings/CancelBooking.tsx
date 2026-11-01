"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { formatPence } from "@/lib/format";
import { cancelBooking } from "./actions";

/**
 * Cancel button with a confirmation dialog. `lateFeePence` is what the server
 * computed at render time (null = free); the action re-checks and may ask
 * again if the booking slipped into the notice window meanwhile.
 */
export function CancelBooking({
  bookingId,
  lateFeePence,
  coolingOff = false,
}: {
  bookingId: string;
  lateFeePence: number | null;
  /** Free only because the booking is within its 14-day cooling-off period. */
  coolingOff?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [fee, setFee] = useState<number | null>(lateFeePence);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      setError(undefined);
      const res = await cancelBooking(bookingId, fee !== null);
      if (res.status === "cancelled") {
        setOpen(false);
        // The row moves to "past" once cancelled, so this component unmounts:
        // the page shows the confirmation from the URL (see CancelNotice).
        const q = res.outcome === "late" ? `?cancelled=late&fee=${res.feePence}` : "?cancelled=free";
        router.replace(`${pathname}${q}`);
        router.refresh();
      } else if (res.status === "needs_confirmation") {
        setFee(res.feePence);
      } else {
        setError(res.message);
      }
    });

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Cancel booking
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel this booking?"
        description={
          fee !== null
            ? `A late cancellation fee of ${formatPence(fee)} will be due. It applies because the lesson is inside our cancellation notice period.`
            : coolingOff
              ? "You're within your 14-day cooling-off period, so there's no charge."
              : "This booking is outside the cancellation notice period, so it is free to cancel."
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep booking
            </Button>
            <Button onClick={confirm} disabled={pending}>
              {fee !== null ? "Yes, cancel and pay the fee" : "Yes, cancel booking"}
            </Button>
          </>
        }
      >
        {error ? <p role="alert" className="text-danger-700">{error}</p> : null}
      </Dialog>
    </>
  );
}
