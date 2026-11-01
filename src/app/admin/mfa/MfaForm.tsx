"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormError } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { startEnrolment, verifyCode, type EnrolmentState, type VerifyState } from "./actions";

export function MfaForm({ enrolled }: { enrolled: boolean }) {
  const [state, action, pending] = useActionState<VerifyState, FormData>(verifyCode, {});
  const [enrolment, setEnrolment] = useState<EnrolmentState | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (enrolled || started.current) return;
    started.current = true;
    void startEnrolment().then(setEnrolment);
  }, [enrolled]);

  const waiting = !enrolled && !enrolment;
  return (
    <div className="flex flex-col gap-5">
      {!enrolled && enrolment?.qrCode ? (
        <div className="flex flex-col gap-3">
          <p>
            Scan this QR code with an authenticator app (such as Google Authenticator or 1Password), then enter the
            6-digit code it shows.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL from Supabase */}
          <img
            src={enrolment.qrCode}
            alt="QR code for your authenticator app"
            width={192}
            height={192}
            className="size-48 self-start rounded-field border-2 border-navy-900 bg-white p-2"
          />
          <p className="text-small">
            Can&apos;t scan it? Enter this key by hand:{" "}
            <code data-testid="totp-secret" className="font-semibold break-all">
              {enrolment.secret}
            </code>
          </p>
        </div>
      ) : null}
      {!enrolled && enrolment?.error ? <FormError>{enrolment.error}</FormError> : null}
      {waiting ? <p role="status">Preparing setup…</p> : null}

      {enrolled || enrolment?.factorId ? (
        <form action={action} className="flex flex-col gap-5">
          {state.error ? <FormError>{state.error}</FormError> : null}
          <input type="hidden" name="factorId" value={enrolment?.factorId ?? ""} />
          <Field
            label="6-digit code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
          />
          <Button type="submit" size="lg" disabled={pending} className="w-full">
            {pending ? "Checking…" : "Verify"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
