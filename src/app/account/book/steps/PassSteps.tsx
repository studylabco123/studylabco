"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { InfoTip } from "@/components/ui/InfoTip";
import { COOLING_OFF_INFO, passInfo, passSessionInfo } from "@/lib/booking/info";
import { lateFeePence } from "@/lib/booking/fees";
import { passSessionValuePence } from "@/lib/booking/pass";
import { quote } from "@/lib/booking/pricing";
import { BookingFailureMessage, COOLING_OFF_TEXT } from "@/lib/booking/results";
import { formatPence } from "@/lib/format";
import type { Level, PassSessions } from "@/lib/types";
import { bookWithGroupPass, buyGroupPass } from "../actions";
import type { ChildOption, SessionOption, WizardPass, WizardSettings } from "../types";
import { bundleDays, seats } from "./SessionStep";
import { Choice, ChoiceList, londonDay, londonTime, londonWhen, StepHeading } from "./shared";

const passPrice = (level: Level, sessions: PassSessions, s: WizardSettings) => quote({ type: "pass", level, sessions }, s).totalPence;

/** The child's passes on the type step: usable ones lead to "Book a session"; one awaiting payment says so. */
export function PassCards({ passes, onBook }: { passes: WizardPass[]; onBook: (passId: string) => void }) {
  if (!passes.length) return null;
  return (
    <ul aria-label="Your group passes" className="flex flex-col gap-3">
      {passes.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-card border-2 border-sky-200 bg-sky-50 px-5 py-4">
          <p className="min-w-0 flex-1">
            {p.text}
            {p.status === "awaiting_payment" ? ` (reference ${p.reference}). Sessions unlock once we've received your payment.` : ""}
          </p>
          {p.bookable ? (
            <Button variant="secondary" onClick={() => onBook(p.id)} aria-label={`Book a session with your ${p.level} group pass`}>
              Book a session
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Buying: 6 or 10 sessions at the child's level. */
export function PassSizeStep({ child, settings, onSelect }: { child: ChildOption; settings: WizardSettings; onSelect: (n: PassSessions) => void }) {
  return (
    <section className="flex flex-col gap-4">
      <StepHeading>Choose your {child.level} group pass</StepHeading>
      <div className="flex max-w-prose flex-wrap items-start gap-1">
        <p className="flex-1 pt-2">
          A pass is a set of {child.level} group sessions for {child.name.split(" ")[0]}, paid up front. Book each session
          from your account once we&apos;ve received your payment.
        </p>
        <InfoTip label="group passes" text={passInfo(child.level, settings)} />
      </div>
      <ChoiceList label="Pass sizes">
        {([6, 10] as const).map((n) => (
          <Choice
            key={n}
            title={`${n} sessions`}
            detail={`${formatPence(passPrice(child.level, n, settings))} · ${formatPence(passSessionValuePence({ pricePence: passPrice(child.level, n, settings), sessionsTotal: n }))} a session`}
            onSelect={() => onSelect(n)}
          />
        ))}
      </ChoiceList>
    </section>
  );
}

/** Buying: check, tick the cooling-off box and buy. */
export function PassBuyReview({ child, sessions, settings }: { child: ChildOption; sessions: PassSessions; settings: WizardSettings }) {
  const [coolingOff, setCoolingOff] = useState(false);
  const [tickError, setTickError] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const total = passPrice(child.level, sessions, settings);
  const days = settings.passMinNoticeDays === 7 ? "a week" : `${settings.passMinNoticeDays} days`;

  function buy() {
    setError(undefined);
    if (!coolingOff) {
      setTickError(BookingFailureMessage.cooling_off_required);
      return;
    }
    setTickError(undefined);
    start(async () => {
      const r = await buyGroupPass({ childId: child.id, sessions, coolingOff });
      if (r?.error) setError(r.error);
    });
  }

  const row = "flex flex-col gap-0.5 sm:flex-row sm:gap-4";
  const term = "font-display font-medium sm:w-32 sm:shrink-0";
  return (
    <section className="flex flex-col gap-5">
      <StepHeading>Check and buy</StepHeading>
      {error ? <FormError>{error}</FormError> : null}
      <dl className="flex flex-col gap-3 rounded-card border border-sky-200 bg-white p-5 sm:p-6">
        <div className={row}>
          <dt className={term}>Child</dt>
          <dd>{child.name}</dd>
        </div>
        <div className={row}>
          <dt className={term}>Pass</dt>
          <dd>
            {child.level} group pass, {sessions} sessions
          </dd>
        </div>
        <div className={`${row} border-t border-sky-200 pt-3 text-lead`}>
          <dt className={term}>Total</dt>
          <dd className="font-display font-semibold" data-testid="total">
            {formatPence(total)}
          </dd>
        </div>
      </dl>
      <div className="flex max-w-prose flex-col gap-2">
        <h3 className="text-h3">How it works</h3>
        <p>
          You pay by bank transfer; we show the details after you buy. Sessions unlock once we&apos;ve received your
          payment, and the pass then lasts {settings.passValidityMonths} months. Book each session at least {days} before
          it.
        </p>
        <div className="flex flex-wrap items-start gap-1">
          <p className="flex-1 pt-2">
            If you change your mind within 14 days of buying, unused sessions go back as credit. After that, unused sessions
            can&apos;t be refunded.
          </p>
          <InfoTip label="group passes" text={passInfo(child.level, settings)} />
        </div>
      </div>
      <div className="flex max-w-prose flex-wrap items-start gap-1">
        <Checkbox
          name="cooling_off"
          checked={coolingOff}
          onChange={(e) => setCoolingOff(e.target.checked)}
          error={tickError}
          label={COOLING_OFF_TEXT}
          className="flex-1 pt-2"
        />
        <InfoTip label="the cooling-off period" text={COOLING_OFF_INFO} />
      </div>
      <div>
        <Button size="lg" onClick={buy} disabled={pending} aria-disabled={pending}>
          {pending ? "Buying…" : "Buy pass"}
        </Button>
      </div>
    </section>
  );
}

/** A pass cannot book a session on or after its expiry (the server refuses it too). */
const beforeExpiry = (s: SessionOption, pass: WizardPass) => !pass.expiresAt || new Date(s.startsAt).getTime() < new Date(pass.expiresAt).getTime();

export type PassPick = { sessionId: string } | { bundleDate: string };

/** Booking with a pass: sessions at the pass's level far enough ahead; a GCSE pass can also take a Sunday bundle (2). */
export function PassSessionStep({
  pass,
  sessions,
  onSelect,
}: {
  pass: WizardPass;
  sessions: SessionOption[];
  onSelect: (p: PassPick) => void;
}) {
  const open = sessions.filter((s) => s.passBookable && s.level === pass.level && beforeExpiry(s, pass));
  const days = pass.level === "GCSE" && pass.remaining >= 2 ? bundleDays(open) : [];
  return (
    <section className="flex flex-col gap-4">
      <StepHeading>Choose a session for your pass</StepHeading>
      <p className="max-w-prose">{pass.text}</p>
      {open.length === 0 ? <p>There are no sessions open for booking with your pass right now. Please check back soon.</p> : null}
      <ChoiceList label="Sessions you can book with your pass">
        {open.map((s) => (
          <Choice
            key={s.id}
            title={`${londonDay(s.startsAt)}, ${londonTime(s.startsAt)}–${londonTime(s.endsAt)}`}
            detail={`${s.title} · uses 1 session · ${seats(s.seatsLeft)}`}
            disabled={s.seatsLeft <= 0}
            onSelect={() => onSelect({ sessionId: s.id })}
            data={{ "data-pass-session": s.startsAt }}
          />
        ))}
        {days.map((d) => (
          <Choice
            key={d.date}
            title={`${londonDay(d.list[0].startsAt)}: both Sunday sessions`}
            detail={`${d.list.map((s) => `${londonTime(s.startsAt)}–${londonTime(s.endsAt)}`).join(" and ")} · uses 2 sessions · ${seats(d.seatsLeft)}`}
            disabled={d.seatsLeft <= 0}
            onSelect={() => onSelect({ bundleDate: d.date })}
          />
        ))}
      </ChoiceList>
    </section>
  );
}

/** Booking with a pass: check and book (nothing to pay; the cooling-off was ticked when the pass was bought). */
export function PassBookReview({
  pass,
  pick,
  sessions,
  childName,
  settings,
}: {
  pass: WizardPass;
  pick: PassPick;
  sessions: SessionOption[];
  childName: string;
  settings: WizardSettings;
}) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const chosen =
    "sessionId" in pick
      ? sessions.filter((s) => s.id === pick.sessionId)
      : bundleDays(sessions.filter((s) => s.passBookable && beforeExpiry(s, pass))).find((d) => d.date === pick.bundleDate)?.list ?? [];
  if (!chosen.length) return <p>That session is no longer available. Please go back and choose another.</p>;
  const uses = chosen.length;
  // The fee basis is the pass's own price ÷ its sessions (rounded down), as stored when it was bought.
  const fee = lateFeePence(passSessionValuePence(pass), settings.lateFeePercent);

  function book() {
    setError(undefined);
    start(async () => {
      const r = await bookWithGroupPass("sessionId" in pick ? { passId: pass.id, sessionId: pick.sessionId } : { passId: pass.id, sundayDate: pick.bundleDate });
      if (r?.error) setError(r.error);
    });
  }

  const row = "flex flex-col gap-0.5 sm:flex-row sm:gap-4";
  const term = "font-display font-medium sm:w-32 sm:shrink-0";
  return (
    <section className="flex flex-col gap-5">
      <StepHeading>Check and book</StepHeading>
      {error ? <FormError>{error}</FormError> : null}
      <dl className="flex flex-col gap-3 rounded-card border border-sky-200 bg-white p-5 sm:p-6">
        <div className={row}>
          <dt className={term}>Child</dt>
          <dd>{childName}</dd>
        </div>
        <div className={row}>
          <dt className={term}>Session</dt>
          <dd>{uses === 2 ? "Sunday bundle (both Sunday group sessions)" : chosen[0].title}</dd>
        </div>
        <div className={row}>
          <dt className={term}>When</dt>
          <dd>
            {uses === 2
              ? `${londonDay(chosen[0].startsAt)}, ${chosen.map((s) => `${londonTime(s.startsAt)}–${londonTime(s.endsAt)}`).join(" and ")}`
              : `${londonWhen(chosen[0].startsAt)}–${londonTime(chosen[0].endsAt)}`}{" "}
            (UK time)
          </dd>
        </div>
        <div className={row}>
          <dt className={term}>Where</dt>
          <dd>{chosen[0].venue ?? settings.groupVenue ?? "Location confirmed on booking"}</dd>
        </div>
        <div className={`${row} border-t border-sky-200 pt-3 text-lead`}>
          <dt className={term}>Pass</dt>
          <dd className="font-display font-semibold">{uses === 2 ? "Uses 2 sessions of your pass" : "Uses 1 session of your pass"}</dd>
        </div>
      </dl>
      <div className="flex max-w-prose flex-wrap items-start gap-1">
        <p className="flex-1 pt-2">
          Nothing more to pay. Cancel at least {settings.cancellationNoticeHours} hours before and the session goes back on
          your pass. After that, cancel by phone or email; the session still goes back on your pass and a late
          cancellation fee of {formatPence(fee)} ({settings.lateFeePercent}% of one session) applies.
        </p>
        <InfoTip label="booking with a pass" text={passSessionInfo(pass.level, settings)} />
      </div>
      <div>
        <Button size="lg" onClick={book} disabled={pending} aria-disabled={pending}>
          {pending ? "Booking…" : "Book with pass"}
        </Button>
      </div>
    </section>
  );
}

