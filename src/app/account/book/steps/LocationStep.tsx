"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { IneligibleMessage } from "@/lib/booking/eligibility";
import { isAllowedPostcode } from "@/lib/booking/postcode";
import { formatPence } from "@/lib/format";
import type { LocationKind } from "@/lib/types";
import type { LessonType, WizardSettings } from "../types";
import { Choice, ChoiceList, LOCATION_LABEL, StepHeading } from "./shared";

export function LocationStep({
  type,
  settings,
  initial,
  onDone,
}: {
  type: LessonType;
  settings: WizardSettings;
  initial: { location?: LocationKind; homeAddress?: string; postcode?: string };
  onDone: (choice: { location: LocationKind; homeAddress?: string; postcode?: string }) => void;
}) {
  // Assessment Lessons are in person only.
  const locations = settings.lessonLocations.filter((l) => type === "one_to_one" || l !== "online");
  const [homeForm, setHomeForm] = useState(initial.location === "home_visit");
  const [address, setAddress] = useState(initial.homeAddress ?? "");
  const [postcode, setPostcode] = useState(initial.postcode ?? "");
  const [errors, setErrors] = useState<{ address?: string; postcode?: string }>({});

  const detail: Partial<Record<LocationKind, string>> = {
    tutor_place: "In Blackburn (BB1). The full address is shared once your booking is confirmed.",
    home_visit: `Sundays only, BB1 and BB2 postcodes. Adds a ${formatPence(settings.travelFeePence)} travel fee and needs the tutor's approval.`,
    online: "A video lesson using the meeting link we send you.",
  };

  function submitHome(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!address.trim()) next.address = "Please enter the address for the home visit.";
    if (!isAllowedPostcode(postcode, settings.allowedPostcodeDistricts)) next.postcode = IneligibleMessage.postcode_not_allowed;
    setErrors(next);
    if (!next.address && !next.postcode) onDone({ location: "home_visit", homeAddress: address.trim(), postcode });
  }

  return (
    <section className="flex flex-col gap-4">
      <StepHeading>Where should the lesson be?</StepHeading>
      <ChoiceList label="Locations">
        {locations.map((l) => (
          <Choice
            key={l}
            title={LOCATION_LABEL[l]}
            detail={detail[l]}
            onSelect={() => (l === "home_visit" ? setHomeForm(true) : onDone({ location: l }))}
          />
        ))}
      </ChoiceList>
      {homeForm ? (
        <form onSubmit={submitHome} noValidate className="flex max-w-xl flex-col gap-4">
          <h3 className="text-h3">Home visit address</h3>
          <Field
            label="Address line"
            name="home_address"
            autoComplete="street-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            error={errors.address}
            required
          />
          <Field
            label="Postcode"
            name="postcode"
            autoComplete="postal-code"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            error={errors.postcode}
            required
          />
          <div>
            <Button type="submit">Continue</Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
