"use client";

import Link from "next/link";
import { useActionState } from "react";
import { addChild, type ChildState } from "@/app/account/children/actions";
import { FormError } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field, SelectField } from "@/components/ui/Field";
import { SUBJECTS, TARGET_GRADES } from "@/lib/children/validation";
import { LevelFields } from "./LevelFields";

export function ChildForm() {
  const [state, action, pending] = useActionState<ChildState, FormData>(addChild, {});
  const e = state.errors ?? {};
  const v = state.values;
  return (
    <form action={action} noValidate className="flex max-w-xl flex-col gap-5">
      {state.formError ? <FormError>{state.formError}</FormError> : null}
      <Field label="First name" name="first_name" defaultValue={v?.first_name} error={e.first_name} required />
      <Field label="Last name" name="last_name" defaultValue={v?.last_name} error={e.last_name} required />
      <LevelFields initial={v} errors={e} />
      <fieldset className="flex flex-col gap-3" aria-describedby={e.subjects ? "subjects-error" : undefined}>
        <legend className="font-display text-small font-medium">Subjects</legend>
        {SUBJECTS.map((s) => (
          <Checkbox key={s} name="subjects" value={s} label={s} defaultChecked={v?.subjects.includes(s)} />
        ))}
        {e.subjects ? (
          <p id="subjects-error" className="text-small font-semibold text-danger-700">
            {e.subjects}
          </p>
        ) : null}
      </fieldset>
      <SelectField label="Target grade (optional)" name="target_grade" defaultValue={v?.target_grade ?? ""} error={e.target_grade}>
        <option value="">Not sure yet</option>
        {TARGET_GRADES.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </SelectField>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save child"}
        </Button>
        <Link href="/account/children" className="underline underline-offset-4 hover:text-navy-600">
          Cancel
        </Link>
      </div>
    </form>
  );
}
