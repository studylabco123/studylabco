import Link from "next/link";
import { LegalPage } from "@/components/site/LegalPage";
import { publicSettings } from "@/lib/public/data";
import { bookingWindowText } from "@/lib/policy";
import { pageMetadata } from "@/lib/public/meta";
import { FALLBACK_EMAIL } from "@/lib/site";

export const metadata = pageMetadata(
  "Terms of Service",
  "The terms for booking and paying for Study Lab Co lessons: bookings, group passes, payment, the 48-hour cancellation rule and late cancellation fee, credit, conduct and your 14-day cooling-off right.",
  "/terms",
);

export default async function TermsPage() {
  const s = await publicSettings();
  const areas = s.allowedPostcodeDistricts.join(" and ");
  return (
    <LegalPage
      title="Terms of Service"
      path="/terms"
      intro="The agreement between you and Study Lab Co when you book lessons. Please read it before your first booking."
    >
      <h2>Who we are</h2>
      <p>
        Study Lab Co is a KS3 and GCSE Science tutoring business run by{" "}
        {s.ownerName?.trim() ? `${s.ownerName.trim()}, a sole trader,` : "a sole trader"} in Blackburn, Lancashire. You can contact us at{" "}
        <a href={`mailto:${FALLBACK_EMAIL}`}>{FALLBACK_EMAIL}</a>. In these terms, &ldquo;we&rdquo; and &ldquo;the tutor&rdquo;
        mean Study Lab Co, and &ldquo;you&rdquo; means the parent or guardian who holds the account.
      </p>

      <h2>Accounts</h2>
      <ul>
        <li>Only a parent or legal guardian aged 18 or over can open an account and book lessons. Children do not have accounts.</li>
        <li>Please keep your details up to date, including a phone number we can reach you on.</li>
        <li>
          Before booking anything other than the Assessment Lesson, you sign the Parent/Guardian Agreement &amp; Consent Form for
          each child.
        </li>
      </ul>

      <h2>KS3 and GCSE</h2>
      <ul>
        <li>
          Students in Years 7 and 8 are KS3, and students in Years 10 and 11 are GCSE. For a Year 9 student, you choose KS3 or
          GCSE when you add your child, and you can change it later.
        </li>
        <li>
          KS3 students can book the KS3 Assessment Lesson (Years 7 and 8), 1-to-1 lessons and KS3 groups. GCSE students can book
          the GCSE Assessment Lesson, 1-to-1 lessons and GCSE groups. Every Year 9 student books the GCSE Assessment Lesson.
        </li>
      </ul>

      <h2>New students</h2>
      <p>
        Every new student starts with a 60-minute Assessment Lesson, which includes a 15-minute talk with the parent or
        guardian, who must be present. After it, the tutor decides whether to approve the student. Other lessons can be booked
        once the student is approved. We may decline to approve a student, for example if we don&apos;t think lessons would be the
        right fit; you are not charged anything beyond the Assessment Lesson.
      </p>

      <h2>Bookings</h2>
      <ul>
        <li>
          You can book up to {bookingWindowText(s.bookingWindowDays)} ahead and no later than {s.minNoticeHours} hours before a lesson. A booking is made when
          you confirm it and receive a confirmation email.
        </li>
        <li>Lessons at the tutor&apos;s place are confirmed straight away.</li>
        {s.homeVisitsEnabled ? (
          <li>
            Home visits are available on Sundays for {areas} postcodes only. They are requests until the tutor approves them;
            if a request is declined you are not charged.
          </li>
        ) : null}
        <li>Group sessions have a limited number of seats, and each is for one level: KS3 or GCSE.</li>
        <li>
          A group pass is 6 or 10 group sessions for one child, at their level, paid upfront by bank transfer. You can book
          sessions with it once we&apos;ve received the payment; it then lasts {s.passValidityMonths} months from that date, and
          each session must be booked at least {s.passMinNoticeDays} days ahead. A Sunday bundle uses 2 sessions of a GCSE
          pass. Sessions not used by the end of the pass expire.
        </li>
        <li>All lessons last 60 minutes.</li>
      </ul>

      <h2>Prices and payment</h2>
      <ul>
        <li>
          Prices are shown on the <Link href="/lessons">Lessons and prices</Link> page and in full, including any travel fee,
          before you confirm a booking. We are not VAT registered, so there is no VAT to add.
        </li>
        <li>
          Pay by bank transfer in advance, or by cash or bank transfer before the lesson starts. Use the payment reference
          shown for your booking. We do not take card payments on the website.
        </li>
        <li>If you owe money for a lesson, you can&apos;t make new bookings until it is paid or we decide not to charge it.</li>
        <li>We may change our prices. A change never affects a booking you have already made.</li>
      </ul>

      <h2>Cancelling and missed lessons</h2>
      <ul>
        <li>
          You can cancel free of charge from your account up to {s.cancellationNoticeHours} hours before the lesson starts.
          If you had already paid, the amount becomes account credit straight away.
        </li>
        <li>
          You can also cancel free of charge at any time in the first 14 days after making a booking, however close the
          lesson is. This is your cooling-off period (see below).
        </li>
        <li>
          With less than {s.cancellationNoticeHours} hours to go, you can&apos;t cancel on the website: please call or email
          us to cancel. Outside the 14-day cooling-off period it is recorded as a late cancellation, and the late cancellation
          fee is {s.lateFeePercent}% of the lesson price (never the travel fee for a home visit). If you had already paid in
          full, we keep the fee and the rest becomes account credit.
        </li>
        <li>
          If the student doesn&apos;t attend without cancelling, it is recorded as a no-show and the same {s.lateFeePercent}% fee
          is due, plus the travel fee for a home visit (the tutor has travelled to you).
        </li>
        <li>In an emergency, please tell us. The tutor can choose not to charge the fee.</li>
        <li>
          If late cancellations or no-shows happen repeatedly, we may talk to you about it and may stop taking new bookings from
          the account.
        </li>
        <li>The full details are in our <Link href="/refunds">Refund Policy</Link>.</li>
      </ul>

      <h2>Group pass sessions and refunds</h2>
      <ul>
        <li>
          Cancel a pass session at least {s.cancellationNoticeHours} hours before it and the session goes back on your pass.
        </li>
        <li>
          With less than {s.cancellationNoticeHours} hours to go (please call or email us), or if your child doesn&apos;t
          attend, the session still goes back on your pass, but a late cancellation fee of {s.lateFeePercent}% of one
          session&apos;s value (the pass price divided by its number of sessions) is due. The tutor can choose not to charge it.
        </li>
        <li>
          Unused pass sessions are not refunded as money. If you cancel a pass within 14 days of buying it, the value of the
          sessions you have not used becomes account credit. After those 14 days, unused sessions can&apos;t be refunded unless
          the tutor decides otherwise.
        </li>
      </ul>

      <h2>Account credit</h2>
      <ul>
        <li>
          Credit is money we hold for you, for example from a paid lesson you cancelled free of charge. The tutor uses it to pay
          for a future lesson.
        </li>
        <li>
          If you would rather have your credit back, email{" "}
          <a href={`mailto:${FALLBACK_EMAIL}`}>{FALLBACK_EMAIL}</a> and we will refund it to your bank account.
        </li>
      </ul>

      <h2>If we cancel</h2>
      <p>
        We may cancel any booking, for example because of illness. We will tell you as soon as we can. You are not charged:
        anything you have paid for that lesson becomes account credit or is refunded, as you prefer, and a session booked with
        a group pass goes back on your pass.
      </p>

      <h2>Your 14-day cooling-off right</h2>
      <p>
        Under the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 you have 14 days from
        making a booking to change your mind. During those 14 days you can cancel any lesson in the booking that hasn&apos;t
        taken place yet, free of charge, even if it is less than {s.cancellationNoticeHours} hours away (with less than{" "}
        {s.cancellationNoticeHours} hours to go, please call or email us and we will cancel it free of charge). Anything you
        have paid for it becomes account credit, and we refund it to you whenever you ask. For a group pass, the 14 days count
        from the day you bought it: cancel the pass in that time and the value of the sessions you have not used becomes
        account credit, which you can also ask us to refund.
      </p>
      <p>
        When you book, you can ask for lessons to start within those 14 days by ticking the box that says &ldquo;I want lessons
        to start within 14 days and understand I lose the right to cancel once a lesson has taken place&rdquo;. Once a lesson has
        been taught, it can&apos;t be cancelled. To cancel, use your account or email us.
      </p>

      <h2>Conduct and safety</h2>
      <ul>
        <li>We expect students to be respectful and ready to learn, and we will treat them with the same respect.</li>
        <li>
          {s.homeVisitsEnabled
            ? "For home visits, a parent, guardian or another responsible adult must be at home for the whole lesson, and the lesson should take place in a shared space such as a kitchen or living room."
            : "A parent or guardian must be present for the talk at the end of the Assessment Lesson."}
        </li>
        <li>
          We may end a lesson early, or stop providing lessons, if behaviour puts anyone at risk or seriously disrupts a group.
        </li>
        <li>
          We follow the safeguarding approach in our <Link href="/safeguarding">Safeguarding</Link> statement and will act on any
          concern about a child&apos;s safety.
        </li>
      </ul>

      <h2>What lessons can and can&apos;t do</h2>
      <p>
        We plan and teach every lesson with care, but results depend on many things, including the student&apos;s own work. We
        don&apos;t promise any particular grade.
      </p>

      <h2>Our responsibility to you</h2>
      <p>
        We are responsible for losses that are a foreseeable result of us breaking these terms or failing to use reasonable
        care and skill. Nothing in these terms limits our liability where it would be unlawful to do so, or affects your legal
        rights as a consumer.
      </p>

      <h2>Your data</h2>
      <p>
        How we use your and your child&apos;s information is explained in our <Link href="/privacy">Privacy Policy</Link>. You
        can delete your account at any time from your account settings.
      </p>

      <h2>Complaints</h2>
      <p>
        If you are unhappy with anything, please email <a href={`mailto:${FALLBACK_EMAIL}`}>{FALLBACK_EMAIL}</a> and we will try
        to put it right.
      </p>

      <h2>Changes and law</h2>
      <p>
        We may update these terms. The version that applies to a booking is the one you agreed to when you made it, and we will
        tell you about important changes. These terms are governed by the law of England and Wales, and the courts of England
        and Wales can hear any dispute.
      </p>
    </LegalPage>
  );
}
