"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { COOLING_OFF_TEXT, BookingFailureMessage } from "@/lib/booking/results";
import { formatPence } from "@/lib/format";
import { confirmBooking } from "../actions";
import type { ConfirmPayload } from "../types";
import { londonWhen, StepHeading } from "./shared";
import { cancellationTerms, type Summary } from "./summary";

export function ReviewStep({ summary, noticeHours }: { summary: Summary; noticeHours: number }) {
  const [coolingOff, setCoolingOff] = useState(false);
  const [tickError, setTickError] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const multi = summary.payload.type === "sunday_bundle" || summary.payload.type === "block";
  // Booking happens now, so the 14-day cooling-off runs from now.
  const [bookedAt] = useState(() => new Date());
  const terms = cancellationTerms(summary.firstStart, noticeHours, multi, bookedAt);

  function confirm() {
    setError(undefined);
    if (!coolingOff) {
      setTickError(BookingFailureMessage.cooling_off_required);
      return;
    }
    setTickError(undefined);
    startTransition(async () => {
      const r = await confirmBooking({ ...summary.payload, coolingOff } as ConfirmPayload);
      if (r?.error) setError(r.error);
    });
  }

  const row = "flex flex-col gap-0.5 sm:flex-row sm:gap-4";
  const term = "font-display font-medium sm:w-32 sm:shrink-0";
  return (
    <section className="flex flex-col gap-5">
      <StepHeading>Check and confirm</StepHeading>
      {error ? <FormError>{error}</FormError> : null}
      <dl className="flex flex-col gap-3 rounded-card border border-sky-200 bg-white p-5 sm:p-6">
        <div className={row}>
          <dt className={term}>Child</dt>
          <dd>{summary.childName}</dd>
        </div>
        <div className={row}>
          <dt className={term}>Lesson</dt>
          <dd>{summary.what}</dd>
        </div>
        <div className={row}>
          <dt className={term}>When</dt>
          <dd>{summary.when} (UK time)</dd>
        </div>
        <div className={row}>
          <dt className={term}>Where</dt>
          <dd>{summary.where}</dd>
        </div>
        <div className={row}>
          <dt className={term}>Price</dt>
          <dd>
            <ul>
              {summary.lines.map((l) => (
                <li key={l.label}>
                  {l.label}: {formatPence(l.pence)}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div className={`${row} border-t border-sky-200 pt-3 text-lead`}>
          <dt className={term}>Total</dt>
          <dd className="font-display font-semibold" data-testid="total">
            {formatPence(summary.totalPence)}
          </dd>
        </div>
      </dl>

      <div className="flex max-w-prose flex-col gap-2">
        <h3 className="text-h3">Cancellation</h3>
        <p>{terms.rule}</p>
        {terms.deadline ? (
          <p>
            Free cancellation until {londonWhen(terms.deadline)}. After that a late cancellation fee of{" "}
            {formatPence(summary.feePence)} applies.
          </p>
        ) : (
          <p>{terms.coolingOffCovers}</p>
        )}
        {summary.pendingApproval ? (
          <p>Home visits are confirmed once the tutor approves them. We will email you either way.</p>
        ) : null}
        <p>You pay by bank transfer or cash before the lesson. We show the payment details after you confirm.</p>
      </div>

      <Checkbox
        name="cooling_off"
        checked={coolingOff}
        onChange={(e) => setCoolingOff(e.target.checked)}
        error={tickError}
        label={COOLING_OFF_TEXT}
      />
      <div>
        <Button size="lg" onClick={confirm} disabled={pending} aria-disabled={pending}>
          {pending ? "Booking…" : "Confirm booking"}
        </Button>
      </div>
    </section>
  );
}
