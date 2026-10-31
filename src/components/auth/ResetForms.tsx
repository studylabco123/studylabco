"use client";

import { useActionState } from "react";
import { requestReset, updatePassword, type ResetState } from "@/app/(auth)/reset/actions";
import { FormError } from "@/components/auth/AuthCard";
import { Turnstile } from "@/components/auth/Turnstile";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

export function RequestResetForm() {
  const [state, action, pending] = useActionState<ResetState, FormData>(requestReset, {});
  if (state.sent) {
    return (
      <p role="status" className="text-body">
        If there is an account for that email, we&rsquo;ve sent a link to reset your password. Open it on this device.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error ? <FormError>{state.error}</FormError> : null}
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Turnstile resetSignal={state} />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action, pending] = useActionState<ResetState, FormData>(updatePassword, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error ? <FormError>{state.error}</FormError> : null}
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        required
      />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
