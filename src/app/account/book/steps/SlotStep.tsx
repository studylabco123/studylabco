"use client";

import { useEffect, useState } from "react";
import { londonDateOf } from "@/lib/time";
import type { LocationKind } from "@/lib/types";
import { loadSlots } from "../actions";
import type { LessonType } from "../types";
import { londonDay, londonTime, StepHeading } from "./shared";

export function SlotStep({
  childId,
  type,
  location,
  onSelect,
}: {
  childId: string;
  type: LessonType;
  location: LocationKind;
  onSelect: (iso: string) => void;
}) {
  const [slots, setSlots] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadSlots({ childId, kind: type, location: location as "tutor_place" | "home_visit" | "online" })
      .then((r) => live && setSlots(r.slots))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [childId, type, location]);

  const days = new Map<string, string[]>();
  for (const s of slots ?? []) {
    const d = londonDateOf(new Date(s));
    days.set(d, [...(days.get(d) ?? []), s]);
  }

  return (
    <section className="flex flex-col gap-4" aria-busy={slots === null && !failed}>
      <StepHeading>Choose a time</StepHeading>
      <p className="text-small text-navy-600">All times are UK time. Lessons last 60 minutes.</p>
      {failed ? (
        <p role="alert">We could not load the free times. Please refresh the page.</p>
      ) : slots === null ? (
        <p role="status">Loading free times…</p>
      ) : slots.length === 0 ? (
        <p>There are no free times open for booking right now. Please check back soon or contact us.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {[...days.entries()].map(([day, times]) => (
            <div key={day} role="group" aria-labelledby={`day-${day}`} className="flex flex-col gap-2">
              <h3 id={`day-${day}`} className="text-h3">
                {londonDay(times[0])}
              </h3>
              <ul className="flex flex-wrap gap-2">
                {times.map((t) => (
                  <li key={t}>
                    <button
                      type="button"
                      data-slot={t}
                      aria-label={`${londonDay(t)} at ${londonTime(t)}`}
                      onClick={() => onSelect(t)}
                      className="min-h-12 min-w-20 rounded-full border-2 border-navy-900 bg-white px-4 font-display font-medium tabular-nums transition-[background-color,transform] duration-150 ease-out hover:bg-sky-100 motion-safe:active:scale-[0.97] motion-safe:active:duration-100"
                    >
                      {londonTime(t)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
