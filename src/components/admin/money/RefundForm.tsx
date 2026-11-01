"use client";

import { useState } from "react";
import { recordRefund } from "@/app/admin/(secure)/money/actions";
import { ActionError, useAdminAction } from "@/components/admin/useAdminAction";
import { Button } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";

/** Record a refund against a paid booking (the refund itself is made outside the site, for example by bank transfer). */
export function RefundForm({ bookings }: { bookings: { id: string; label: string }[] }) {
  const { run, pending, error } = useAdminAction();
  const [bookingId, setBookingId] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <form
      aria-label="Record a refund"
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => recordRefund(bookingId, amount), () => setAmount(""));
      }}
    >
      <SelectField label="Paid booking" value={bookingId} onChange={(e) => setBookingId(e.target.value)} required>
        <option value="" disabled>
          Choose a booking
        </option>
        {bookings.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </SelectField>
      <Field label="Refund (pounds)" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="25" autoComplete="off" required />
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" variant="secondary" disabled={pending}>
          Record refund
        </Button>
        <ActionError message={error} />
      </div>
    </form>
  );
}
