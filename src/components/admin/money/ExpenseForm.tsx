"use client";

import { useRef } from "react";
import { addExpense } from "@/app/admin/(secure)/money/actions";
import { ActionError, useAdminAction } from "@/components/admin/useAdminAction";
import { Button } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { EXPENSE_CATEGORIES } from "@/lib/money/categories";

/** Add an expense; the receipt can be photographed straight from a phone camera. */
export function ExpenseForm({ today }: { today: string }) {
  const { run, pending, error } = useAdminAction();
  const form = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={form}
      aria-label="Add an expense"
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        run(() => addExpense(data), () => form.current?.reset());
      }}
    >
      <Field label="Date" name="date" type="date" defaultValue={today} max={today} required />
      <Field label="Amount (pounds)" name="amount" inputMode="decimal" placeholder="21.50" autoComplete="off" required />
      <SelectField label="Category" name="category" defaultValue="" required>
        <option value="" disabled>
          Choose a category
        </option>
        {EXPENSE_CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </SelectField>
      <Field label="Description (optional)" name="description" maxLength={200} autoComplete="off" />
      <Field label="Take a photo of the receipt" name="receipt" type="file" accept="image/*" capture="environment" hint="Opens the camera on a phone." />
      <Field label="Or choose a receipt file" name="receiptFile" type="file" accept="image/*,application/pdf" hint="A photo or PDF, up to 10 MB." />
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Add expense"}
        </Button>
        <ActionError message={error} />
      </div>
    </form>
  );
}
