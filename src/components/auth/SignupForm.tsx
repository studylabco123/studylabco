"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type SignupState } from "@/app/(auth)/signup/actions";
import { Turnstile } from "@/components/auth/Turnstile";
import { FormError } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field } from "@/components/ui/Field";

const linkClass = "underline underline-offset-4 hover:text-navy-600";

export function SignupForm() {
  const [state, action, pending] = useActionState<SignupState, FormData>(signUp, {});
  const e = state.errors ?? {};
  const v = state.values;
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.formError ? <FormError>{state.formError}</FormError> : null}
      <Field label="Full name" name="full_name" autoComplete="name" defaultValue={v?.full_name} error={e.full_name} required />
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={v?.email} error={e.email} required />
      <Field
        label="Mobile number"
        name="phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        hint="A UK mobile, so we can reach you about lessons."
        defaultValue={v?.phone}
        error={e.phone}
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        error={e.password}
        required
      />
      <fieldset className="flex flex-col gap-4">
        <legend className="sr-only">Consents</legend>
        <Checkbox
          name="age_guardian"
          defaultChecked={v?.age_guardian}
          error={e.age_guardian}
          label="I am 18 or over and the parent or legal guardian of the child I'm booking for"
        />
        <Checkbox
          name="terms"
          defaultChecked={v?.terms}
          error={e.terms}
          label={
            <>
              I agree to the{" "}
              <Link href="/terms" className={linkClass}>
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/refunds" className={linkClass}>
                Refund Policy
              </Link>
            </>
          }
        />
        <Checkbox
          name="marketing"
          defaultChecked={v?.marketing}
          label="Send me occasional updates about Study Lab Co (optional)"
        />
      </fieldset>
      <Turnstile resetSignal={state} />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-small text-navy-600">
        Already have an account?{" "}
        <Link href="/login" className={linkClass}>
          Log in
        </Link>
      </p>
    </form>
  );
}
