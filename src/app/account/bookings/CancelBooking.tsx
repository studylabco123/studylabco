"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { cancelBooking } from "./actions";

/**
 * Cancel button with a confirmation dialog. Only rendered while the lesson is
 * at least the notice period away, so cancelling is always free. The action
 * re-checks on the server and answers 'call_required' if the booking slipped
 * into the notice window meanwhile.
 */
export function CancelBooking({ bookingId, fromPass = false }: { bookingId: string; fromPass?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      setError(undefined);
      const res = await cancelBooking(bookingId);
      if (res.status === "cancelled") {
        setOpen(false);
        // The row moves to "past" once cancelled, so this component unmounts:
        // the page shows the confirmation from the URL (see CancelNotice).
        router.replace(`${pathname}?cancelled=free`);
        router.refresh();
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
          fromPass
            ? "This is free to cancel, and the session goes back on your group pass."
            : "This is free to cancel. If you have already paid, the payment is kept as credit on your account."
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep booking
            </Button>
            <Button onClick={confirm} disabled={pending}>
              Yes, cancel booking
            </Button>
          </>
        }
      >
        {error ? <p role="alert" className="text-danger-700">{error}</p> : null}
      </Dialog>
    </>
  );
}
