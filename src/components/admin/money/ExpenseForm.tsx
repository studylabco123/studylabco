"use client";

import { useRef } from "react";
import { addExpense, prepareReceiptUpload } from "@/app/admin/(secure)/money/actions";
import { ActionError, useAdminAction } from "@/components/admin/useAdminAction";
import { Button } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { fail } from "@/lib/admin/result";
import { createBrowserClient } from "@/lib/supabase/client";
import { EXPENSE_CATEGORIES } from "@/lib/money/categories";

const text = (d: FormData, k: string) => (typeof d.get(k) === "string" ? (d.get(k) as string) : "");

/** Uploads the receipt (if any) straight to private storage, then records the expense. */
async function submit(data: FormData) {
  const picked = [data.get("receipt"), data.get("receiptFile")].find((f): f is File => f instanceof File && f.size > 0);
  let receiptPath: string | null = null;
  if (picked) {
    const ticket = await prepareReceiptUpload(picked.type, picked.size, text(data, "date"));
    if (!ticket.ok) return ticket;
    const up = await createBrowserClient().storage.from("receipts").uploadToSignedUrl(ticket.path, ticket.token, picked, { contentType: picked.type });
    if (up.error) return fail("The receipt did not upload. Please try again.");
    receiptPath = ticket.path;
  }
  return addExpense({ date: text(data, "date"), category: text(data, "category"), description: text(data, "description"), amount: text(data, "amount"), receiptPath });
}

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
        run(() => submit(data), () => form.current?.reset());
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
      <Field label="Or choose a receipt file" name="receiptFile" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" hint="A photo or PDF, up to 10 MB." />
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Add expense"}
        </Button>
        <ActionError message={error} />
      </div>
    </form>
  );
}
