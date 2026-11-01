"use client";

import { useState } from "react";
import { formatPence } from "@/lib/format";
import { BLOCK_HOLD_HOURS } from "@/lib/policy";
import { londonDateOf } from "@/lib/time";
import type { BlockWeeks, GroupProduct } from "@/lib/types";
import type { BlockChoice, SessionOption, WizardSettings } from "../types";
import { Choice, ChoiceList, londonDay, londonTime, PRODUCT_LABEL, StepHeading } from "./shared";

const seats = (n: number) => (n <= 0 ? "Full" : n === 1 ? "1 seat left" : `${n} seats left`);

/** Sunday dates where both bundle sessions are bookable, with the lower seat count. */
function bundleDays(sessions: SessionOption[]) {
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

export function BlockStep({
  sessions,
  settings,
  initial,
  onSelect,
}: {
  sessions: SessionOption[];
  settings: WizardSettings;
  initial?: BlockChoice;
  onSelect: (b: BlockChoice) => void;
}) {
  const [product, setProduct] = useState<GroupProduct>(initial?.product ?? "saturday");
  const [weeks, setWeeks] = useState<BlockWeeks>(initial?.weeks ?? 6);
  const starts =
    product === "saturday"
      ? sessions
          .filter((s) => s.product === "saturday")
          .map((s) => ({ date: londonDateOf(new Date(s.startsAt)), at: s.startsAt, seatsLeft: s.seatsLeft }))
      : bundleDays(sessions).map((d) => ({ date: d.date, at: d.list[0].startsAt, seatsLeft: d.seatsLeft }));

  const radio = "size-5 accent-navy-900";
  return (
    <section className="flex flex-col gap-5">
      <StepHeading>Choose your group block</StepHeading>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-display font-medium">Which group?</legend>
        {(["saturday", "sunday_bundle"] as const).map((p) => (
          <label key={p} className="flex min-h-11 items-center gap-3">
            <input type="radio" name="product" className={radio} checked={product === p} onChange={() => setProduct(p)} />
            {PRODUCT_LABEL[p]}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-display font-medium">How many weeks?</legend>
        {([6, 10] as const).map((w) => (
          <label key={w} className="flex min-h-11 items-center gap-3">
            <input type="radio" name="weeks" className={radio} checked={weeks === w} onChange={() => setWeeks(w)} />
            {w} weeks, {formatPence(settings.blockPrices[product][w])}
          </label>
        ))}
      </fieldset>
      <h3 className="text-h3">First week</h3>
      <p className="max-w-prose text-small text-navy-600">
        Weeks without a session (for example holidays) are skipped, so the block carries on the next week. Seats are
        held for {BLOCK_HOLD_HOURS} hours while you pay.
      </p>
      {starts.length === 0 ? <p>There are no start dates open for booking right now.</p> : null}
      <ChoiceList label="Start dates">
        {starts.map((s) => (
          <Choice
            key={s.date}
            title={`Starting ${londonDay(s.at)}`}
            detail={seats(s.seatsLeft)}
            disabled={s.seatsLeft <= 0}
            onSelect={() => onSelect({ product, weeks, firstDate: s.date })}
          />
        ))}
      </ChoiceList>
    </section>
  );
}
