"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteAvailabilityRule, saveAvailabilityRule } from "@/app/admin/(secure)/settings/hours/actions";
import { ActionError, useAdminAction } from "@/components/admin/useAdminAction";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/Field";
import { KIND_LABEL } from "@/lib/admin/labels";
import type { AvailabilityRule, BookingKind, LocationKind, PeriodKind } from "@/lib/types";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const PERIODS: { id: PeriodKind; title: string }[] = [
  { id: "term", title: "Term time" },
  { id: "holiday", title: "School holidays" },
];
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const PLACE_LABEL: Record<string, string> = { tutor_place: "Your place", home_visit: "Home visits", online: "Online" };

function places(locations: LocationKind[], onlineEnabled: boolean): string {
  return locations
    .filter((l) => onlineEnabled || l !== "online")
    .map((l) => PLACE_LABEL[l])
    .filter(Boolean)
    .join(", ");
}

function describe(r: AvailabilityRule, onlineEnabled: boolean): string {
  const kinds = r.kinds.map((k) => KIND_LABEL[k]).join(", ");
  return `${SHORT[r.weekday]} ${r.startTime}–${r.endTime} · ${kinds} · ${places(r.locations, onlineEnabled)}`;
}

interface FormState {
  id?: string;
  period: PeriodKind;
  weekday: number;
  startTime: string;
  endTime: string;
  kinds: BookingKind[];
  locations: LocationKind[];
}

const blank = (period: PeriodKind): FormState => ({ period, weekday: 1, startTime: "17:00", endTime: "20:00", kinds: ["assessment", "one_to_one"], locations: ["tutor_place"] });

/** Weekly teaching hours for term time and school holidays. Times are UK time. */
export function HoursEditor({ rules, onlineEnabled }: { rules: AvailabilityRule[]; onlineEnabled: boolean }) {
  const [form, setForm] = useState<FormState>(blank("term"));
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState<AvailabilityRule>();
  const save = useAdminAction();
  const remove = useAdminAction();

  const toggle = <T extends string>(list: T[], value: T, on: boolean): T[] => (on ? [...list.filter((v) => v !== value), value] : list.filter((v) => v !== value));
  const sunday = form.weekday === 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/settings" className="self-start underline">
          Back to settings
        </Link>
        <h1 className="text-h1">Teaching hours</h1>
        <p>Lessons can be booked inside these weekly windows, one every hour from the start. All times are UK time.</p>
        <p>Changes only affect times parents can book from now on. Bookings you already have are not changed.</p>
      </div>

      {PERIODS.map(({ id, title }) => {
        const list = rules
          .filter((r) => r.period === id)
          .sort((a, b) => WEEK_ORDER.indexOf(a.weekday) - WEEK_ORDER.indexOf(b.weekday) || a.startTime.localeCompare(b.startTime));
        return (
          <Card key={id} as="section" aria-labelledby={`${id}-h`} className="flex flex-col gap-4 p-4 sm:p-6">
            <h2 id={`${id}-h`} className="text-h2">
              {title}
            </h2>
            {list.length === 0 ? (
              <p>No hours set, so nobody can book at this time of year.</p>
            ) : (
              <table className="w-full text-left">
                <caption className="sr-only">{title} weekly hours</caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Window</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className="border-t border-navy-200">
                      <td className="py-3 pr-3 align-top">{describe(r, onlineEnabled)}</td>
                      <td className="py-3 align-top">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="secondary"
                            aria-label={`Change ${describe(r, onlineEnabled)}`}
                            onClick={() => {
                              setForm({ id: r.id, period: r.period, weekday: r.weekday, startTime: r.startTime, endTime: r.endTime, kinds: r.kinds, locations: r.locations });
                              setEditing(true);
                            }}
                          >
                            Change
                          </Button>
                          <Button variant="secondary" aria-label={`Delete ${describe(r, onlineEnabled)}`} onClick={() => setRemoving(r)}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        );
      })}

      <Card as="section" aria-labelledby="rule-h" className="flex flex-col gap-4 p-4 sm:p-6">
        <h2 id="rule-h" className="text-h2">
          {editing ? "Change a time window" : "Add a time window"}
        </h2>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.run(
              () => saveAvailabilityRule(form),
              () => {
                setForm(blank(form.period));
                setEditing(false);
              },
            );
          }}
        >
          <SelectField label="When in the year" name="period" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as PeriodKind })}>
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Day of the week"
            name="weekday"
            value={form.weekday}
            onChange={(e) => {
              const weekday = Number(e.target.value);
              setForm({ ...form, weekday, locations: weekday === 0 ? form.locations : form.locations.filter((l) => l !== "home_visit") });
            }}
          >
            {WEEK_ORDER.map((d) => (
              <option key={d} value={d}>
                {DAYS[d]}
              </option>
            ))}
          </SelectField>
          <div className="grid grid-cols-2 gap-4">
            <SelectField label="From" name="start" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}>
              {TIMES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </SelectField>
            <SelectField label="Until" name="end" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} hint="At least one hour after the start.">
              {TIMES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </SelectField>
          </div>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 font-semibold">Lessons offered</legend>
            {(["assessment", "one_to_one"] as const).map((k) => (
              <Checkbox key={k} label={KIND_LABEL[k]} name={`kind-${k}`} checked={form.kinds.includes(k)} onChange={(e) => setForm({ ...form, kinds: toggle(form.kinds, k, e.target.checked) })} />
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 font-semibold">Where</legend>
            <Checkbox label={PLACE_LABEL.tutor_place} name="place-tutor_place" checked={form.locations.includes("tutor_place")} onChange={(e) => setForm({ ...form, locations: toggle(form.locations, "tutor_place", e.target.checked) })} />
            {sunday ? (
              <Checkbox label={PLACE_LABEL.home_visit} description="Only possible on Sundays." name="place-home_visit" checked={form.locations.includes("home_visit")} onChange={(e) => setForm({ ...form, locations: toggle(form.locations, "home_visit", e.target.checked) })} />
            ) : null}
            {onlineEnabled ? (
              <Checkbox label={PLACE_LABEL.online} name="place-online" checked={form.locations.includes("online")} onChange={(e) => setForm({ ...form, locations: toggle(form.locations, "online", e.target.checked) })} />
            ) : null}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={save.pending}>
              {editing ? "Save changes" : "Add time window"}
            </Button>
            {editing ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setForm(blank(form.period));
                  setEditing(false);
                }}
              >
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
        title="Delete this time window?"
        description={removing ? `${describe(removing, onlineEnabled)}. Parents will no longer be offered these times. Existing bookings are not changed.` : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={() => setRemoving(undefined)}>
              Keep it
            </Button>
            <Button disabled={remove.pending} onClick={() => removing && remove.run(() => deleteAvailabilityRule(removing.id), () => setRemoving(undefined))}>
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
