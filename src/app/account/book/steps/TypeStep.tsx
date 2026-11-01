"use client";

import Link from "next/link";
import { IneligibleMessage } from "@/lib/booking/eligibility";
import { formatPence } from "@/lib/format";
import type { ChildOption, SessionOption, WizardSettings, WizardType } from "../types";
import { groupPriceText } from "./labels";
import { Choice, ChoiceList, StepHeading, TYPE_LABEL } from "./shared";

function details(s: WizardSettings, sessions: SessionOption[]): Record<WizardType, string> {
  const groupPrice = groupPriceText(sessions);
  const homeVisit = s.lessonLocations.includes("home_visit");
  const fromBlock = Math.min(s.blockPrices.saturday[6], s.blockPrices.sunday_bundle[6]);
  return {
    assessment: `60 minutes in person, with a 15-minute talk with you. ${formatPence(s.priceAssessmentPence)}${
      homeVisit ? ` (home visit ${formatPence(s.priceAssessmentPence + s.travelFeePence)})` : ""
    }.`,
    one_to_one: `60 minutes, ${formatPence(s.priceOneToOnePence)}${
      homeVisit ? ` (home visit ${formatPence(s.priceOneToOnePence + s.travelFeePence)})` : ""
    }.`,
    group: groupPrice ? `One 60-minute group session, ${groupPrice}.` : "One 60-minute group session.",
    sunday_bundle: `Both Sunday group sessions on one day, ${formatPence(s.priceSundayBundlePence)}.`,
    block: `6 or 10 weeks of Saturday group or Sunday bundle sessions, from ${formatPence(fromBlock)}.`,
  };
}

export function TypeStep({
  child,
  settings,
  sessions,
  familyMessage,
  onSelect,
}: {
  child: ChildOption;
  settings: WizardSettings;
  /** Open group sessions: each has its own price, so the group card quotes the lowest. */
  sessions: SessionOption[];
  familyMessage: string | null;
  onSelect: (t: WizardType) => void;
}) {
  const d = details(settings, sessions);
  let notice: React.ReactNode = null;
  let types: WizardType[] = [];
  if (familyMessage) notice = familyMessage;
  else if (!child.hasAgreement)
    notice = (
      <>
        {IneligibleMessage.agreement_missing}{" "}
        <Link href={`/account/children/${child.id}/agreement`} className="underline underline-offset-4">
          Sign the agreement for {child.name}
        </Link>
      </>
    );
  else if (child.approved) types = ["one_to_one", "group", "sunday_bundle", "block"];
  else if (child.assessmentBooked)
    notice = `${IneligibleMessage.assessment_already_booked} ${IneligibleMessage.not_approved}`;
  else types = ["assessment"];

  return (
    <section className="flex flex-col gap-4">
      <StepHeading>What would you like to book?</StepHeading>
      {notice ? <p className="max-w-prose rounded-field bg-sky-100 px-4 py-3">{notice}</p> : null}
      {types.length ? (
        <ChoiceList label="Lesson types">
          {types.map((t) => (
            <Choice key={t} title={TYPE_LABEL[t]} detail={d[t]} onSelect={() => onSelect(t)} />
          ))}
        </ChoiceList>
      ) : null}
      {types[0] === "assessment" ? (
        <p className="max-w-prose text-small text-navy-600">
          1-to-1 lessons and group sessions open once the Assessment Lesson has taken place and the tutor has approved{" "}
          {child.name.split(" ")[0]}.
        </p>
      ) : null}
    </section>
  );
}
