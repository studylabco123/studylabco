"use client";

import { useState, useTransition, type ReactNode } from "react";
import { saveSettings } from "@/app/admin/(secure)/settings/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field, TextareaField } from "@/components/ui/Field";
import { InfoTip } from "@/components/ui/InfoTip";
import type { SettingsErrors, SettingsFormInput } from "@/lib/admin/settings-validation";

type TextKey = { [K in keyof SettingsFormInput]: SettingsFormInput[K] extends string ? K : never }[keyof SettingsFormInput];

const PRICE_NOTE = "Changing it applies to new bookings only; existing bookings keep the price they were made at.";

/** The short explanation behind each field's "i" button. */
const HELP: Record<keyof SettingsFormInput, string> = {
  priceAssessment: `The GCSE Assessment Lesson at your place, for Years 10–11 and every Year 9 student. ${PRICE_NOTE}`,
  priceOneToOne: `A 60-minute GCSE 1-to-1 lesson at your place. Home visits add the travel fee. ${PRICE_NOTE}`,
  priceGroup: `The price of one GCSE group session (Sunday groups). Also used to show the saving on GCSE passes. ${PRICE_NOTE}`,
  priceSundayBundle: `Both Sunday GCSE sessions booked together without a pass. With a GCSE pass, a bundle uses 2 sessions instead. ${PRICE_NOTE}`,
  travelFee: "Added on top of the lesson price for every home visit. It is never part of the late cancellation fee, but is owed for a home-visit no-show.",
  priceKs3Assessment: `The KS3 Assessment Lesson at your place, for Years 7–8 (Year 9 always takes the GCSE one). ${PRICE_NOTE}`,
  priceKs3OneToOne: `A 60-minute KS3 1-to-1 lesson at your place. Home visits add the travel fee. ${PRICE_NOTE}`,
  priceKs3Group: `The price of one KS3 group session (the Saturday group). Also used to show the saving on KS3 passes. ${PRICE_NOTE}`,
  passKs36: "What a parent pays upfront for 6 KS3 group sessions. The website shows the saving against 6 single KS3 sessions.",
  passKs310: "What a parent pays upfront for 10 KS3 group sessions. The website shows the saving against 10 single KS3 sessions.",
  passGcse6: "What a parent pays upfront for 6 GCSE group sessions. The website shows the saving against 6 single GCSE sessions.",
  passGcse10: "What a parent pays upfront for 10 GCSE group sessions. The website shows the saving against 10 single GCSE sessions.",
  passValidityMonths: "How long a pass lasts, counted from the day you mark it paid. Sessions not booked and taken by then expire.",
  passMinNoticeDays: "How many days before a group session a parent must book it with a pass. 7 means at least a week ahead.",
  tutorPlaceEnabled: "Lets parents book lessons at your teaching address. They are confirmed straight away.",
  homeVisitsEnabled: "Lets parents request Sunday lessons at their home, in the postcode districts below. Each request waits for your approval.",
  onlineEnabled: "Lets parents book video lessons. While it is off, nothing on the public website mentions online lessons.",
  cancellationNoticeHours: "Parents can cancel on the website, free of charge, only while the lesson is at least this many hours away. Closer than that, they must call or email you.",
  minNoticeHours: "The latest a parent can book: at least this many hours before the lesson starts.",
  bookingWindowDays: "How far into the future the booking calendar shows free times.",
  defaultGroupCapacity: "How many seats a new group starts with. You can change each group separately.",
  homeVisitBufferMinutes: "Time kept free before and after a home visit for travelling, so no other lesson is booked into it.",
  lateFeePercent: "The share of the lesson price owed for a late cancellation or a no-show. For a pass session it is this share of one session's value. You can always choose not to charge it.",
  flagThreshold: "After this many late cancellations or no-shows, the family is flagged for you to review. Nothing is blocked automatically.",
  allowedPostcodeDistricts: "Only addresses in these postcode districts can request a home visit. Separate them with commas or spaces.",
  ownerName: "Shown in the footer and on Contact as \u201cStudy Lab Co is run by \u2026\u201d, as the law asks for the trader's name. Leave it empty to hide it.",
  businessPhone: "Shown on Contact and in the footer, so parents can call or message you, for example to cancel at short notice.",
  groupVenue: "Where group sessions take place, unless a group has its own venue. Shown on the Group sessions page.",
  businessAddress: "Your business (virtual office) address, shown in the footer. Never your teaching address.",
  bankAccountName: "The name on your bank account. Parents see it only on their own booking confirmation, to pay by bank transfer.",
  bankSortCode: "Your bank sort code. Parents see it only on their own booking confirmation.",
  bankAccountNumber: "Your bank account number. Parents see it only on their own booking confirmation.",
  meetingLink: "The video link sent with online bookings. Only used while online lessons are turned on.",
  teachingAddress: "Where lessons at your place happen. Sent to parents only once a booking is confirmed; never shown on the website.",
};

/** The field's name for its "i" button ("More about …"), without the (£) and other units. */
const helpName = (label: string) => label.replace(/\s*\((£|hours|days|months|minutes)\)\s*$/, "").replace(/\s*\(shown on the website\)$/, "");

/** Every public and private setting. Prices are in pounds; the bank details and address are never shown outside the admin. */
export function SettingsForm({ initial }: { initial: SettingsFormInput }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, start] = useTransition();

  const text = (key: TextKey, label: string, extra: { hint?: ReactNode; inputMode?: "decimal" | "numeric"; type?: string; autoComplete?: string } = {}) => (
    <Field
      label={label}
      name={key}
      info={{ label: helpName(label), text: HELP[key] }}
      value={values[key]}
      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
      error={errors[key]}
      autoComplete={extra.autoComplete ?? "off"}
      {...extra}
    />
  );
  const money = (key: TextKey, label: string) => text(key, `${label} (£)`, { inputMode: "decimal" });
  const whole = (key: TextKey, label: string, hint?: ReactNode) => text(key, label, { inputMode: "numeric", hint });
  const toggle = (key: "tutorPlaceEnabled" | "homeVisitsEnabled" | "onlineEnabled", label: string, description: string) => (
    <div className="flex flex-wrap items-start gap-x-1">
      <Checkbox
        className="min-w-0 flex-1 pt-2.5"
        label={label}
        description={description}
        name={key}
        checked={values[key]}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.checked }))}
      />
      <InfoTip label={`${label} setting`} text={HELP[key]} />
    </div>
  );

  return (
    <form
      className="flex flex-col gap-8"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(undefined);
        start(async () => {
          const res = await saveSettings(values);
          if (res.ok) {
            setErrors({});
            setMessage({ ok: true, text: "Settings saved." });
          } else {
            setErrors(res.errors);
            setMessage({ ok: false, text: res.message });
          }
        });
      }}
    >
      <Section title="Prices">
        {money("priceAssessment", "Assessment Lesson")}
        {money("priceOneToOne", "1-to-1 lesson")}
        {money("priceGroup", "Group session")}
        {money("priceSundayBundle", "Sunday bundle (both sessions)")}
        {money("travelFee", "Home visit travel fee")}
      </Section>

      <Section title="KS3 prices" note="Years 7 to 9 (KS3). Home visit travel is added on top.">
        {money("priceKs3Assessment", "Assessment lesson, KS3")}
        {money("priceKs3OneToOne", "1-to-1 lesson, KS3")}
        {money("priceKs3Group", "Group session, KS3")}
      </Section>

      <Section title="Pass prices" note="What a parent pays for a group pass (6 or 10 sessions at the child's level).">
        {money("passKs36", "KS3 pass, 6 sessions")}
        {money("passKs310", "KS3 pass, 10 sessions")}
        {money("passGcse6", "GCSE pass, 6 sessions")}
        {money("passGcse10", "GCSE pass, 10 sessions")}
        {whole("passValidityMonths", "Pass valid for (months)", "From the date you mark it paid. 1 to 24.")}
        {whole("passMinNoticeDays", "Book pass sessions at least (days) ahead", "0 to 30.")}
      </Section>

      <Section title="Where lessons can happen" note="Turn a place off and parents can no longer choose it. Existing bookings are not changed.">
        <div className="flex flex-col gap-4 sm:col-span-2">
          {toggle("tutorPlaceEnabled", "Tutor's place", "Lessons at your teaching address.")}
          {toggle("homeVisitsEnabled", "Home visits", "You travel to the family. They need your approval.")}
          {toggle("onlineEnabled", "Online", "Lessons by video link.")}
        </div>
      </Section>

      <Section title="Booking rules">
        {whole("cancellationNoticeHours", "Free cancellation notice (hours)")}
        {whole("minNoticeHours", "Shortest notice to book (hours)")}
        {whole("bookingWindowDays", "How far ahead parents can book (days)")}
        {whole("defaultGroupCapacity", "Default seats in a group")}
        {whole("homeVisitBufferMinutes", "Travel time around a home visit (minutes)")}
        {whole("lateFeePercent", "Late cancellation fee (% of the lesson price)", "0 to 100. Travel is not included.")}
        {whole("flagThreshold", "Late cancellations or no-shows before a family is flagged")}
        {text("allowedPostcodeDistricts", "Home visit postcode districts", { hint: "For example BB1, BB2" })}
      </Section>

      <Section title="Business details">
        {text("ownerName", "Your name (shown on the website)", {
          hint: "Shown in the footer and on Contact as \u201cStudy Lab Co is run by \u2026\u201d. Leave empty to hide it.",
        })}
        {text("businessPhone", "Business phone", { type: "tel" })}
        {text("groupVenue", "Group venue")}
        <TextareaField
          className="sm:col-span-2"
          label="Business address"
          name="businessAddress"
          info={{ label: "Business address", text: HELP.businessAddress }}
          rows={3}
          value={values.businessAddress}
          onChange={(e) => setValues((v) => ({ ...v, businessAddress: e.target.value }))}
          error={errors.businessAddress}
        />
      </Section>

      <Section title="Bank and teaching details" note="Only you can see these here. Parents see them only on their own booking confirmation.">
        {text("bankAccountName", "Account name")}
        {text("bankSortCode", "Sort code", { hint: "Six digits, like 12-34-56", inputMode: "numeric" })}
        {text("bankAccountNumber", "Account number", { hint: "Eight digits", inputMode: "numeric" })}
        {text("meetingLink", "Online meeting link", { type: "url", hint: "Sent with online bookings" })}
        <TextareaField
          className="sm:col-span-2"
          label="Teaching address"
          name="teachingAddress"
          info={{ label: "Teaching address", text: HELP.teachingAddress }}
          rows={3}
          value={values.teachingAddress}
          onChange={(e) => setValues((v) => ({ ...v, teachingAddress: e.target.value }))}
          error={errors.teachingAddress}
        />
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          Save settings
        </Button>
        {message ? (
          <p role={message.ok ? "status" : "alert"} className={message.ok ? "font-semibold text-success-700" : "font-semibold text-danger-700"}>
            {message.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Card as="section" aria-label={title} className="flex flex-col gap-4 p-4 sm:p-6">
      <h2 className="text-h2">{title}</h2>
      {note ? <p className="text-navy-600">{note}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}
