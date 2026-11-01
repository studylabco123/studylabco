"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteTermPeriod, saveTermPeriod } from "@/app/admin/(secure)/settings/terms/actions";
import { ActionError, useAdminAction } from "@/components/admin/useAdminAction";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import type { TermPeriod } from "@/lib/types";

const fmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const day = (d: string) => fmt.format(new Date(`${d}T12:00:00Z`));
const range = (t: TermPeriod) => `${t.label}: ${day(t.startsOn)} to ${day(t.endsOn)}`;

interface FormState {
  id?: string;
  label: string;
  startsOn: string;
  endsOn: string;
}
const blank: FormState = { label: "", startsOn: "", endsOn: "" };

/** Term dates. Any date inside a term uses term hours; every other date uses holiday hours. */
export function TermsEditor({ terms }: { terms: TermPeriod[] }) {
  const [form, setForm] = useState<FormState>(blank);
  const [removing, setRemoving] = useState<TermPeriod>();
  const save = useAdminAction();
  const remove = useAdminAction();
  const editing = form.id !== undefined;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/settings" className="self-start underline">
          Back to settings
        </Link>
        <h1 className="text-h1">Term dates</h1>
        <p>Any date not inside a term period uses holiday hours. Both the first and last day count as part of the term.</p>
        <p>Changes only affect times parents can book from now on. Bookings you already have are not changed.</p>
      </div>

      <Card as="section" aria-labelledby="terms-h" className="flex flex-col gap-4 p-4 sm:p-6">
        <h2 id="terms-h" className="text-h2">
          Term periods
        </h2>
        {terms.length === 0 ? (
          <p>No term periods, so every date uses holiday hours.</p>
        ) : (
          <ul className="flex flex-col">
            {terms.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-navy-200 py-3 first:border-t-0">
                <span>{range(t)}</span>
                <span className="flex flex-wrap gap-2">
                  <Button variant="secondary" aria-label={`Change ${range(t)}`} onClick={() => setForm({ id: t.id, label: t.label, startsOn: t.startsOn, endsOn: t.endsOn })}>
                    Change
                  </Button>
                  <Button variant="secondary" aria-label={`Delete ${range(t)}`} onClick={() => setRemoving(t)}>
                    Delete
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card as="section" aria-labelledby="term-form-h" className="flex flex-col gap-4 p-4 sm:p-6">
        <h2 id="term-form-h" className="text-h2">
          {editing ? "Change a term period" : "Add a term period"}
        </h2>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.run(() => saveTermPeriod(form), () => setForm(blank));
          }}
        >
          <Field label="Name" name="label" maxLength={60} required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} hint="For example, Autumn 1." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First day" name="startsOn" type="date" required value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} />
            <Field label="Last day" name="endsOn" type="date" required value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={save.pending}>
              {editing ? "Save changes" : "Add term period"}
            </Button>
            {editing ? (
              <Button variant="secondary" onClick={() => setForm(blank)}>
                Cancel
              </Button>
            ) : null}
          </div>
          <ActionError message={save.error} />
        </form>
      </Card>

      <Dialog
        open={removing !== undefined}
        onClose={() => setRemoving(undefined)}
        title="Delete this term period?"
        description={removing ? `${range(removing)}. Those dates will use holiday hours. Existing bookings are not changed.` : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={() => setRemoving(undefined)}>
              Keep it
            </Button>
            <Button disabled={remove.pending} onClick={() => removing && remove.run(() => deleteTermPeriod(removing.id), () => setRemoving(undefined))}>
              Yes, delete it
            </Button>
          </>
        }
      >
        <ActionError message={remove.error} />
      </Dialog>
    </div>
  );
}
