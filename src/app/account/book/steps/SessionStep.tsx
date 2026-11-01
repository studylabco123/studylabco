"use client";

import { formatPence } from "@/lib/format";
import { londonDateOf } from "@/lib/time";
import type { SessionOption } from "../types";
import { Choice, ChoiceList, londonDay, londonTime, StepHeading } from "./shared";

export const seats = (n: number) => (n <= 0 ? "Full" : n === 1 ? "1 seat left" : `${n} seats left`);

/** Sunday dates where both bundle sessions are bookable, with the lower seat count. */
export function bundleDays(sessions: SessionOption[]) {
  const byDate = new Map<string, SessionOption[]>();
  for (const s of sessions.filter((x) => x.product === "sunday_bundle")) {
    const d = londonDateOf(new Date(s.startsAt));
    byDate.set(d, [...(byDate.get(d) ?? []), s]);
  }
  return [...byDate.entries()]
    .filter(([, list]) => list.length === 2)
    .map(([date, list]) => ({ date, list, seatsLeft: Math.min(...list.map((s) => s.seatsLeft)) }));
}

export function GroupSessionStep({ sessions, onSelect }: { sessions: SessionOption[]; onSelect: (id: string) => void }) {
  return (
    <section className="flex flex-col gap-4">
      <StepHeading>Choose a group session</StepHeading>
      {sessions.length === 0 ? <p>There are no group sessions open for booking right now.</p> : null}
      <ChoiceList label="Group sessions">
        {sessions.map((s) => (
          <Choice
            key={s.id}
            title={`${londonDay(s.startsAt)}, ${londonTime(s.startsAt)}–${londonTime(s.endsAt)}`}
            detail={`${s.title} · ${formatPence(s.pricePence)} · ${seats(s.seatsLeft)}`}
            disabled={s.seatsLeft <= 0}
            onSelect={() => onSelect(s.id)}
          />
        ))}
      </ChoiceList>
    </section>
  );
}

export function BundleStep({ sessions, onSelect }: { sessions: SessionOption[]; onSelect: (date: string) => void }) {
  const days = bundleDays(sessions);
  return (
    <section className="flex flex-col gap-4">
      <StepHeading>Choose a Sunday</StepHeading>
      {days.length === 0 ? <p>There are no Sunday bundles open for booking right now.</p> : null}
      <ChoiceList label="Sundays">
        {days.map((d) => (
          <Choice
            key={d.date}
            title={londonDay(d.list[0].startsAt)}
            detail={`${d.list.map((s) => `${londonTime(s.startsAt)}–${londonTime(s.endsAt)}`).join(" and ")} · ${seats(d.seatsLeft)}`}
            disabled={d.seatsLeft <= 0}
            onSelect={() => onSelect(d.date)}
          />
        ))}
      </ChoiceList>
    </section>
  );
}
