"use client";

import { useState } from "react";
import { createOneOff, createSeries } from "@/app/admin/(secure)/groups/actions";
import { ActionError, useAdminAction } from "@/components/admin/useAdminAction";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field, SelectField } from "@/components/ui/Field";

const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Create a weekly group, or a single one-off session. Times are UK time. */
export function GroupForms({ today, defaultCapacity, defaultPrice }: { today: string; defaultCapacity: number; defaultPrice: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SeriesForm today={today} defaultCapacity={defaultCapacity} defaultPrice={defaultPrice} />
      <OneOffForm today={today} defaultCapacity={defaultCapacity} defaultPrice={defaultPrice} />
    </div>
  );
}

type Props = { today: string; defaultCapacity: number; defaultPrice: string };

function SeriesForm({ today, defaultCapacity, defaultPrice }: Props) {
  const { run, pending, error } = useAdminAction();
  const [done, setDone] = useState(false);
  return (
    <Card as="section" aria-labelledby="new-series-h" className="flex flex-col gap-4 p-4 sm:p-5">
      <h3 id="new-series-h" className="font-display text-h3">
        Add a weekly group
      </h3>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          const startsOn = String(f.get("startsOn"));
          setDone(false);
          run(
            () =>
              createSeries({
                title: String(f.get("title")),
                weekday: weekdayOf(startsOn),
                startTime: String(f.get("startTime")),
                capacity: Number(f.get("capacity")),
                price: String(f.get("price")),
                venue: String(f.get("venue")),
                isOnline: f.get("isOnline") === "on",
                level: f.get("level") === "KS3" ? "KS3" : "GCSE",
                product: "",
                startsOn,
              }),
            () => {
              setDone(true);
              form.reset();
            },
          );
        }}
      >
        <Field label="Title" name="title" required maxLength={120} />
        <Field label="First date" name="startsOn" type="date" required defaultValue={today} hint="It repeats on this day of the week." />
        <Field label="Start time (UK time)" name="startTime" type="time" required defaultValue="09:00" />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Seats" name="capacity" type="number" inputMode="numeric" min={1} max={100} required defaultValue={defaultCapacity} />
          <Field label="Price per session (£)" name="price" inputMode="decimal" required defaultValue={defaultPrice} />
        </div>
        <LevelField />
        <Field label="Venue (optional)" name="venue" maxLength={300} />
        <Checkbox label="Online group" name="isOnline" />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            Add weekly group
          </Button>
          {done && !error ? <span role="status">Group added.</span> : null}
        </div>
        <ActionError message={error} />
      </form>
    </Card>
  );
}

function OneOffForm({ today, defaultCapacity, defaultPrice }: Props) {
  const { run, pending, error } = useAdminAction();
  const [done, setDone] = useState(false);
  return (
    <Card as="section" aria-labelledby="new-oneoff-h" className="flex flex-col gap-4 p-4 sm:p-5">
      <h3 id="new-oneoff-h" className="font-display text-h3">
        Add a one-off session
      </h3>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          setDone(false);
          run(
            () =>
              createOneOff({
                title: String(f.get("title")),
                date: String(f.get("date")),
                startTime: String(f.get("startTime")),
                durationMinutes: Number(f.get("durationMinutes")),
                capacity: Number(f.get("capacity")),
                price: String(f.get("price")),
                venue: String(f.get("venue")),
                isOnline: f.get("isOnline") === "on",
                level: f.get("level") === "KS3" ? "KS3" : "GCSE",
              }),
            () => {
              setDone(true);
              form.reset();
            },
          );
        }}
      >
        <Field label="Title" name="title" required maxLength={120} />
        <Field label="Date" name="date" type="date" required defaultValue={today} />
        <Field label="Start time (UK time)" name="startTime" type="time" required defaultValue="10:00" />
        <SelectField label="Length" name="durationMinutes" defaultValue="60">
          {[30, 45, 60, 90, 120].map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </SelectField>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Seats" name="capacity" type="number" inputMode="numeric" min={1} max={100} required defaultValue={defaultCapacity} />
          <Field label="Price (£)" name="price" inputMode="decimal" required defaultValue={defaultPrice} />
        </div>
        <LevelField />
        <Field label="Venue (optional)" name="venue" maxLength={300} />
        <Checkbox label="Online session" name="isOnline" />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            Add one-off session
          </Button>
          {done && !error ? <span role="status">Session added.</span> : null}
        </div>
        <ActionError message={error} />
      </form>
    </Card>
  );
}


/** Required: a group is for KS3 or for GCSE children, never both. */
function LevelField() {
  return (
    <SelectField label="Level" name="level" required defaultValue="" hint="Only children at this level can book it.">
      <option value="" disabled>
        Choose a level
      </option>
      <option value="KS3">KS3 (Years 7–9)</option>
      <option value="GCSE">GCSE (Years 10 & 11)</option>
    </SelectField>
  );
}
