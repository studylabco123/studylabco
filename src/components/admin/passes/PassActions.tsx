"use client";

import { useState } from "react";
import { convertPassToCredit, markPassPaid } from "@/app/admin/(secure)/money/actions";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ActionError, useAdminAction } from "../useAdminAction";

/** Mark a pass paid, or end it (unused sessions of a paid pass become credit). */
export function PassActions({ passId, reference, status }: { passId: string; reference: string; status: string }) {
  const { run, pending, error } = useAdminAction();
  const [open, setOpen] = useState(false);
  const unpaid = status === "awaiting_payment";
  const endLabel = unpaid ? "Cancel unpaid pass" : "Convert to credit";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {unpaid ? (
        <>
          <Button
            disabled={pending}
            aria-label={`Mark pass paid (bank transfer) for ${reference}`}
            onClick={() => run(() => markPassPaid(passId, "bank_transfer"))}
          >
            Mark paid (bank transfer)
          </Button>
          <Button
            variant="secondary"
            disabled={pending}
            aria-label={`Mark pass paid (cash) for ${reference}`}
            onClick={() => run(() => markPassPaid(passId, "cash"))}
          >
            Mark paid (cash)
          </Button>
        </>
      ) : null}
      <Button variant="secondary" disabled={pending} aria-label={`${endLabel} for ${reference}`} onClick={() => setOpen(true)}>
        {endLabel}
      </Button>
      <ActionError message={open ? undefined : error} />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={unpaid ? "Cancel this unpaid pass?" : "Convert this pass to credit?"}
        description={
          unpaid
            ? "Nothing has been paid, so nothing is owed or credited."
            : "The pass ends now. Its booked future sessions are cancelled and the value of every unused session becomes account credit."
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep pass
            </Button>
            <Button disabled={pending} onClick={() => run(() => convertPassToCredit(passId), () => setOpen(false))}>
              {unpaid ? "Yes, cancel it" : "Yes, convert it"}
            </Button>
          </>
        }
      >
        <ActionError message={error} />
      </Dialog>
    </div>
  );
}
