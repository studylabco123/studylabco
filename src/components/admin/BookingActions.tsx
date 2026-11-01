"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { decideHomeVisit, markAttended, markNoShow, markPaid, tutorCancel, waiveFee } from "@/app/admin/(secure)/bookings/actions";
import { ActionError, useAdminAction } from "./useAdminAction";

export interface BookingActionsProps {
  bookingId: string;
  childName: string;
  status: string;
  location: string;
  paymentStatus: string;
  /** The lesson has started. */
  started: boolean;
  /** Money owed now (pence); 0 when nothing is owed. */
  owedPence: number;
  /** Part of a Sunday bundle (paying one row pays both). */
  bundle: boolean;
  /** Part of a block (paid from the Blocks section instead). */
  inBlock: boolean;
}

/** The buttons that make sense for one booking right now. */
export function BookingActions(p: BookingActionsProps) {
  const { run, pending, error } = useAdminAction();
  const [cancelOpen, setCancelOpen] = useState(false);
  const label = (text: string) => `${text} for ${p.childName}`;
  const live = p.status === "pending" || p.status === "confirmed";
  const paid = p.paymentStatus === "paid";

  const buttons: React.ReactNode[] = [];
  const btn = (key: string, text: string, onClick: () => void, variant: "primary" | "secondary" = "secondary") =>
    buttons.push(
      <Button key={key} variant={variant} disabled={pending} aria-label={label(text)} onClick={onClick}>
        {text}
      </Button>,
    );

  if (p.status === "pending" && p.location === "home_visit") {
    btn("approve", "Approve home visit", () => run(() => decideHomeVisit(p.bookingId, true)), "primary");
    btn("decline", "Decline home visit", () => run(() => decideHomeVisit(p.bookingId, false)));
  }
  if (p.status === "confirmed" && p.started) {
    btn("attended", "Mark attended", () => run(() => markAttended(p.bookingId)), "primary");
    btn("noshow", "Mark no-show", () => run(() => markNoShow(p.bookingId)));
  }
  // Parents often pay before the lesson, so payment can be recorded any time it is unpaid.
  const unpaid = p.paymentStatus === "unpaid" && p.status !== "cancelled" && p.status !== "declined";
  const awaitingApproval = p.status === "pending" && p.location === "home_visit";
  if (unpaid && !p.inBlock && !awaitingApproval) {
    const what = p.bundle ? "Mark bundle paid" : "Mark paid";
    btn("paid-bank", `${what} (bank transfer)`, () => run(() => markPaid(p.bookingId, "bank_transfer")), "primary");
    btn("paid-cash", `${what} (cash)`, () => run(() => markPaid(p.bookingId, "cash")));
  }
  if (unpaid && p.owedPence > 0 && p.status !== "confirmed" && p.status !== "pending") {
    btn("waive", "Waive fee", () => run(() => waiveFee(p.bookingId)));
  }
  if (live) btn("cancel", "Cancel booking", () => setCancelOpen(true));

  if (!buttons.length && !error) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {buttons}
      <ActionError message={cancelOpen ? undefined : error} />
      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Cancel ${p.childName}'s booking?`}
        description={
          paid
            ? "It has been paid. Choose whether to refund it or keep the money as a credit. The family is emailed and no fee applies."
            : "The family is emailed and no fee applies."
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep booking
            </Button>
            {paid ? (
              <>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => run(() => tutorCancel(p.bookingId, false), () => setCancelOpen(false))}
                >
                  Cancel and credit
                </Button>
                <Button disabled={pending} onClick={() => run(() => tutorCancel(p.bookingId, true), () => setCancelOpen(false))}>
                  Cancel and refund
                </Button>
              </>
            ) : (
              <Button disabled={pending} onClick={() => run(() => tutorCancel(p.bookingId, false), () => setCancelOpen(false))}>
                Yes, cancel it
              </Button>
            )}
          </>
        }
      >
        <ActionError message={error} />
      </Dialog>
    </div>
  );
}

