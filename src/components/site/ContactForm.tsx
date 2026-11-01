"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { sendContact, type ContactState } from "@/app/(public)/contact/actions";
import { FormError } from "@/components/auth/AuthCard";
import { Turnstile } from "@/components/auth/Turnstile";
import { Button } from "@/components/ui/Button";
import { Field, TextareaField } from "@/components/ui/Field";

const ORDER = ["name", "email", "phone", "message"] as const;

/** Contact form: emails the business inbox; nothing is stored. */
export function ContactForm() {
  const [state, action, pending] = useActionState<ContactState, FormData>(sendContact, {});
  // The result whose thank-you note was closed with "Send another message".
  const [dismissed, setDismissed] = useState<ContactState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const thanksRef = useRef<HTMLParagraphElement>(null);
  const e = state.errors ?? {};
  const v = state.values;
  const sent = state.sent === true && dismissed !== state;

  // Move focus to the first field that needs fixing, or to the thank-you note.
  useEffect(() => {
    if (state.sent) {
      thanksRef.current?.focus();
      return;
    }
    const first = ORDER.find((k) => state.errors?.[k]);
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  }, [state]);

  return (
    <div className="flex flex-col gap-5">
      <div role="status" className="empty:hidden">
        {sent ? (
          <div className="flex flex-col items-start gap-3 rounded-card border-2 border-success-700 bg-success-50 p-5 text-success-700">
            <p ref={thanksRef} tabIndex={-1} className="font-display text-lead font-semibold focus:outline-none">
              Thanks, your message has been sent.
            </p>
            <p className="text-small text-navy-900">We usually reply within one working day, by email or phone.</p>
          </div>
        ) : null}
      </div>
      {sent ? (
        <Button variant="secondary" onClick={() => setDismissed(state)} className="self-start">
          Send another message
        </Button>
      ) : (
        <form
          ref={formRef}
          action={action}
          noValidate
          className="relative flex flex-col gap-5"
        >
          {state.formError ? <FormError>{state.formError}</FormError> : null}
          <Field label="Your name" name="name" autoComplete="name" defaultValue={v?.name} error={e.name} required />
          <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={v?.email} error={e.email} required />
          <Field
            label="Phone (optional)"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            hint="If you'd rather we called you back."
            defaultValue={v?.phone}
            error={e.phone}
          />
          <TextareaField
            label="Message"
            name="message"
            rows={6}
            hint="Up to 2,000 characters. Please don't include medical details here."
            defaultValue={v?.message}
            error={e.message}
            required
          />
          {/* Honeypot for bots: hidden from people, screen readers and the Tab order. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label htmlFor="contact-website">Leave this field empty</label>
            <input id="contact-website" type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </div>
          <Turnstile resetSignal={state} />
          <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto sm:self-start">
            {pending ? "Sending…" : "Send message"}
          </Button>
        </form>
      )}
    </div>
  );
}
