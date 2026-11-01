"use client";

import { useState, useTransition, type ReactNode } from "react";
import { saveSettings } from "@/app/admin/(secure)/settings/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field, TextareaField } from "@/components/ui/Field";
import type { SettingsErrors, SettingsFormInput } from "@/lib/admin/settings-validation";

type TextKey = { [K in keyof SettingsFormInput]: SettingsFormInput[K] extends string ? K : never }[keyof SettingsFormInput];

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
    <Checkbox label={label} description={description} name={key} checked={values[key]} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.checked }))} />
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

      <Section title="Block prices" note="What a parent pays to book a whole block of weeks.">
        {money("blockSaturday6", "Saturday, 6 weeks")}
        {money("blockSaturday10", "Saturday, 10 weeks")}
        {money("blockSunday6", "Sunday bundle, 6 weeks")}
        {money("blockSunday10", "Sunday bundle, 10 weeks")}
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
