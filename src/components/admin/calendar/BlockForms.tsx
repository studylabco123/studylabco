"use client";

import { useState } from "react";
import { blockRange, blockRepeating } from "@/app/admin/(secure)/calendar/actions";
import { ActionError, useAdminAction } from "@/components/admin/useAdminAction";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, SelectField } from "@/components/ui/Field";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Block a stretch of time, or the same time every week. Times are UK time. */
export function BlockForms({ today }: { today: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <OneOffForm />
      <RepeatingForm today={today} />
    </div>
  );
}

function OneOffForm() {
  const { run, pending, error } = useAdminAction();
  const [done, setDone] = useState(false);
  return (
    <Card as="section" aria-labelledby="block-range-h" className="flex flex-col gap-4 p-4 sm:p-5">
      <h3 id="block-range-h" className="font-display text-h3">
        Block some time
      </h3>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setDone(false);
          run(() => blockRange(String(f.get("from")), String(f.get("to")), String(f.get("reason"))), () => setDone(true));
        }}
      >
        <Field label="From (UK time)" name="from" type="datetime-local" required />
        <Field label="Until (UK time)" name="to" type="datetime-local" required />
        <Field label="Reason (optional)" name="reason" maxLength={200} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            Block this time
          </Button>
          {done && !error ? <span role="status">Blocked.</span> : null}
        </div>
        <ActionError message={error} />
      </form>
    </Card>
  );
}

function RepeatingForm({ today }: { today: string }) {
  const { run, pending, error } = useAdminAction();
  const [done, setDone] = useState(false);
  return (
    <Card as="section" aria-labelledby="block-repeat-h" className="flex flex-col gap-4 p-4 sm:p-5">
      <h3 id="block-repeat-h" className="font-display text-h3">
        Block the same time every week
      </h3>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setDone(false);
          run(
            () =>
              blockRepeating(
                Number(f.get("weekday")),
                String(f.get("start")),
                String(f.get("end")),
                String(f.get("validFrom")),
                String(f.get("validTo") ?? "") || undefined,
                String(f.get("reason")),
              ),
            () => setDone(true),
          );
        }}
      >
        <SelectField label="Day of the week" name="weekday" defaultValue="3">
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </SelectField>
        <div className="grid grid-cols-2 gap-4">
          <Field label="From (UK time)" name="start" type="time" required defaultValue="17:00" />
          <Field label="Until (UK time)" name="end" type="time" required defaultValue="18:00" />
        </div>
        <Field label="Starting on" name="validFrom" type="date" required defaultValue={today} />
        <Field label="Last day (optional)" name="validTo" type="date" hint="Leave empty to repeat until you remove it." />
        <Field label="Reason (optional)" name="reason" maxLength={200} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            Block every week
          </Button>
          {done && !error ? <span role="status">Blocked.</span> : null}
        </div>
        <ActionError message={error} />
      </form>
    </Card>
  );
}
