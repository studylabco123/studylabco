"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { cancelPass } from "./actions";

/** Cancel a pass within 14 days of buying it (the server re-checks the date). */
export function CancelPass({ passId, paid, label }: { passId: string; paid: boolean; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      const res = await cancelPass(passId);
      setMessage({ ok: res.ok, text: res.message });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    });

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} aria-label={`Cancel ${label}`}>
        Cancel pass
      </Button>
      {message && !open ? (
        <p role="status" className={message.ok ? "basis-full" : "basis-full text-danger-700"}>
          {message.text}
        </p>
      ) : null}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel this group pass?"
        description={
          paid
            ? "You are within 14 days of buying it. Any sessions you have booked ahead are cancelled, and the value of every unused session goes back as credit on your account."
            : "You have not paid for it yet, so nothing is owed."
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep pass
            </Button>
            <Button onClick={confirm} disabled={pending}>
              Yes, cancel pass
            </Button>
          </>
        }
      >
        {message && !message.ok ? (
          <p role="alert" className="text-danger-700">
            {message.text}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
