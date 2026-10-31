"use client";

import { useActionState } from "react";
import { signAgreement, type AgreementState } from "@/app/account/children/[id]/agreement/actions";
import { FormError } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field, TextareaField } from "@/components/ui/Field";

export function AgreementForm({ childId, childName }: { childId: string; childName: string }) {
  const [state, action, pending] = useActionState<AgreementState, FormData>(signAgreement.bind(null, childId), {});
  const e = state.errors ?? {};
  const v = state.values;
  return (
    <form action={action} noValidate className="flex max-w-xl flex-col gap-5">
      {state.formError ? <FormError>{state.formError}</FormError> : null}
      <Field
        label="Emergency contact name"
        name="emergency_contact_name"
        autoComplete="off"
        defaultValue={v?.emergency_contact_name}
        error={e.emergency_contact_name}
        required
      />
      <Field
        label="Emergency contact phone"
        name="emergency_contact_phone"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        hint="A UK mobile or landline."
        defaultValue={v?.emergency_contact_phone}
        error={e.emergency_contact_phone}
        required
      />
      <TextareaField
        label="Medical information (optional)"
        name="medical_info"
        rows={3}
        hint={`Conditions or allergies we should know about for ${childName}.`}
        defaultValue={v?.medical_info}
        error={e.medical_info}
      />
      <TextareaField
        label="Special educational needs (optional)"
        name="sen_info"
        rows={3}
        hint="Anything that helps us teach in the way that suits them."
        defaultValue={v?.sen_info}
        error={e.sen_info}
      />
      <fieldset className="flex flex-col gap-4">
        <legend className="sr-only">Consents</legend>
        <Checkbox
          name="consent_contact"
          defaultChecked={v?.consent_contact}
          error={e.consent_contact}
          label="I agree that Study Lab Co may contact me by phone and email about lessons"
        />
        <Checkbox
          name="agree"
          defaultChecked={v?.agree}
          error={e.agree}
          label="I have read and agree to the Parent/Guardian Agreement & Consent Form"
        />
      </fieldset>
      <Field
        label="Type your full name to sign"
        name="signed_name"
        autoComplete="name"
        hint="This must match the name on your account."
        defaultValue={v?.signed_name}
        error={e.signed_name}
        required
      />
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Signing…" : "Sign agreement"}
      </Button>
    </form>
  );
}
