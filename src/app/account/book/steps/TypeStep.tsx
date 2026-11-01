"use client";

import Link from "next/link";
import { IneligibleMessage } from "@/lib/booking/eligibility";
import { typeInfo } from "@/lib/booking/info";
import type { ChildOption, SessionOption, WizardSettings, WizardType } from "../types";
import { approvedTypes, typeDetails } from "./options";
import { Choice, ChoiceList, StepHeading, TYPE_LABEL } from "./shared";

export function TypeStep({
  child,
  settings,
  sessions,
  familyMessage,
  onSelect,
}: {
  child: ChildOption;
  settings: WizardSettings;
  /** Open group sessions at the child's level: each has its own price, so the group card quotes the lowest. */
  sessions: SessionOption[];
  familyMessage: string | null;
  onSelect: (t: WizardType) => void;
}) {
  const d = typeDetails(child, settings, sessions);
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
  else if (child.approved) types = approvedTypes(child.level);
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
            <Choice
              key={t}
              title={TYPE_LABEL[t]}
              detail={d[t]}
              onSelect={() => onSelect(t)}
              info={{ label: TYPE_LABEL[t], text: typeInfo(t, child.level, settings) }}
            />
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
