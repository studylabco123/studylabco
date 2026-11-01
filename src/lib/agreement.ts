export interface AgreementSection {
  id: "bookings" | "safeguarding" | "contact" | "emergency" | "online";
  heading: string;
  paragraphs: string[];
  /** Rendered only when online lessons are switched on. */
  onlineOnly?: boolean;
}

export const AGREEMENT_TEXT = {
  title: "Parent/Guardian Agreement & Consent Form",
  intro:
    "Please read this through and sign at the bottom. You only need to do this once for each child, before the first booking.",
  sections: [
    {
      id: "bookings",
      heading: "Bookings, payment and the 48-hour cancellation policy",
      paragraphs: [
        "Lessons are booked and paid for through your account, as set out in our Terms and Refund Policy.",
        "If you need to cancel or move a lesson, please let us know at least 48 hours before it starts and there is nothing to pay. If a lesson is cancelled with less than 48 hours' notice, or your child does not attend, a late cancellation fee of {lateFeePercent}% of the lesson price applies.",
      ],
    },
    {
      id: "safeguarding",
      heading: "Safeguarding and the Assessment Lesson",
      paragraphs: [
        "Your child's safety comes first. Our tutor has an enhanced DBS check and follows safeguarding good practice at every lesson.",
        "A parent or guardian must be present for the 15-minute talk in the Assessment Lesson, so we can agree goals together. For home visits, a parent or guardian should be at home during the lesson.",
      ],
    },
    {
      id: "online",
      heading: "Online lesson rules",
      onlineOnly: true,
      paragraphs: [
        "Online lessons take place on the meeting link we send you. Please make sure your child joins from a quiet, shared area of the home, with a parent or guardian nearby.",
        "Lessons are not recorded, and please do not record them either.",
      ],
    },
    {
      id: "contact",
      heading: "Contact consent",
      paragraphs: [
        "You agree that we may contact you by phone and by email about bookings, lessons, payments and your child's progress.",
      ],
    },
    {
      id: "emergency",
      heading: "Emergency and medical information",
      paragraphs: [
        "Please give us an emergency contact we can reach during lessons. If you are not available, we will try them.",
        "Tell us about any medical conditions, allergies or special educational needs (SEN) that would help us look after your child. This is optional, is only used to look after your child, and is never shown on the public website.",
      ],
    },
  ] satisfies AgreementSection[],
};

/** The sections to show, with the late cancellation fee filled in from Settings. */
export function agreementSections(s: { onlineEnabled: boolean; lateFeePercent: number }): AgreementSection[] {
  return AGREEMENT_TEXT.sections
    .filter((x) => !x.onlineOnly || s.onlineEnabled)
    .map((x) => ({ ...x, paragraphs: x.paragraphs.map((p) => p.replaceAll("{lateFeePercent}", String(s.lateFeePercent))) }));
}
