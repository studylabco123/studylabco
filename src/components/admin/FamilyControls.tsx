"use client";

import { useState } from "react";
import { payFromCredit, recordLateCancellation } from "@/app/admin/(secure)/bookings/actions";
import { addManualBooking, addNote, approveStudent, setBlocked } from "@/app/admin/(secure)/families/actions";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, SelectField, TextareaField } from "@/components/ui/Field";
import { ActionError, useAdminAction } from "./useAdminAction";

export function ApproveStudentButton({ childId, name }: { childId: string; name: string }) {
  const { run, pending, error } = useAdminAction();
  return (
    <div className="flex flex-col items-start gap-2">
      <Button disabled={pending} onClick={() => run(() => approveStudent(childId))}>
        Approve {name} for lessons
      </Button>
      <ActionError message={error} />
    </div>
  );
}

/** Pays one unpaid booking (or its held block) from the family's credit; the server checks the balance. */
export function PayFromCreditButton({ bookingId, label }: { bookingId: string; label: string }) {
  const { run, pending, error } = useAdminAction();
  return (
    <>
      <Button variant="secondary" disabled={pending} aria-label={label} onClick={() => run(() => payFromCredit(bookingId))}>
        {label.startsWith("Pay block") ? "Pay block from credit" : "Pay from credit"}
      </Button>
      <ActionError message={error} />
    </>
  );
}

/**
 * Records a cancellation the parent made by phone or email. The server decides
 * free (14-day cooling-off or 48 hours or more ahead) or late (the late
 * cancellation fee); a paid booking keeps its credit for the rest.
 */
export function RecordLateCancellationButton({ bookingId, label }: { bookingId: string; label: string }) {
  const { run, pending, error } = useAdminAction();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" disabled={pending} aria-label={label} onClick={() => setOpen(true)}>
        Record late cancellation
      </Button>
      <ActionError message={open ? undefined : error} />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Record this cancellation?"
        description="Use this when the parent has cancelled by phone or email. Inside the notice period the late cancellation fee applies, unless the booking is within its 14-day cooling-off, when it is free. The family is emailed."
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep booking
            </Button>
            <Button disabled={pending} onClick={() => run(() => recordLateCancellation(bookingId), () => setOpen(false))}>
              Yes, record it
            </Button>
          </>
        }
      >
        <ActionError message={error} />
      </Dialog>
    </>
  );
}

/** Block or unblock a parent. The reason is only ever shown to the admin. */
export function BlockToggle({ parentId, blocked, reason }: { parentId: string; blocked: boolean; reason: string | null }) {
  const { run, pending, error } = useAdminAction();
  const [text, setText] = useState("");
  if (blocked) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p>
          This account is blocked and cannot book. Parents see &ldquo;Please contact Study Lab Co.&rdquo; Reason:{" "}
          <strong>{reason || "none given"}</strong>
        </p>
        <Button variant="secondary" disabled={pending} onClick={() => run(() => setBlocked(parentId, false, ""))}>
          Unblock account
        </Button>
        <ActionError message={error} />
      </div>
    );
  }
  return (
    <form
      className="flex flex-col items-start gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setBlocked(parentId, true, text), () => setText(""));
      }}
    >
      <TextareaField
        className="w-full max-w-prose"
        label="Reason (only you can see this)"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        Block account
      </Button>
      <ActionError message={error} />
    </form>
  );
}

export function NoteForm({ childId, name }: { childId: string; name: string }) {
  const { run, pending, error } = useAdminAction();
  const [text, setText] = useState("");
  return (
    <form
      className="flex flex-col items-start gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addNote(childId, text), () => setText(""));
      }}
    >
      <TextareaField
        className="w-full max-w-prose"
        label={`Note about ${name}`}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={4000}
      />
      <Button type="submit" variant="secondary" disabled={pending} aria-label={`Add note for ${name}`}>
        Add note
      </Button>
      <ActionError message={error} />
    </form>
  );
}

/** Adds a confirmed booking without the parent-facing rules (slots, approval, notice, online toggle). */
export function ManualBookingForm({ parentId, childId, name }: { parentId: string; childId: string; name: string }) {
  const { run, pending, error } = useAdminAction();
  const [kind, setKind] = useState<"one_to_one" | "assessment">("one_to_one");
  const [location, setLocation] = useState<"tutor_place" | "home_visit" | "online">("tutor_place");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [address, setAddress] = useState("");
  const [postcode, setPostcode] = useState("");
  const [added, setAdded] = useState(false);
  return (
    <form
      aria-label={`Add a booking for ${name}`}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setAdded(false);
        run(
          async () => {
            const res = await addManualBooking({ parentId, childId, kind, location, date, time, homeAddress: address, postcode });
            return res.ok ? { ok: true } : res;
          },
          () => setAdded(true),
        );
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Lesson" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="one_to_one">1-to-1 lesson</option>
          <option value="assessment">Assessment Lesson</option>
        </SelectField>
        <SelectField label="Where" value={location} onChange={(e) => setLocation(e.target.value as typeof location)}>
          <option value="tutor_place">Tutor&rsquo;s place</option>
          <option value="home_visit">Home visit</option>
          <option value="online">Online</option>
        </SelectField>
        <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <Field label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
      </div>
      {location === "home_visit" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Address" value={address} onChange={(e) => setAddress(e.target.value)} required />
          <Field label="Postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          Add booking
        </Button>
        {added && !error ? <p role="status">Booking added.</p> : null}
      </div>
      <ActionError message={error} />
    </form>
  );
}
