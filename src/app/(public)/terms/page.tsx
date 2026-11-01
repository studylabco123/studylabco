import Link from "next/link";
import { LegalPage } from "@/components/site/LegalPage";
import { publicSettings } from "@/lib/public/data";
import { bookingWindowText } from "@/lib/policy";
import { pageMetadata } from "@/lib/public/meta";
import { FALLBACK_EMAIL } from "@/lib/site";

export const metadata = pageMetadata(
  "Terms of Service",
  "The terms for booking and paying for Study Lab Co lessons: bookings, payment, the 48-hour cancellation rule, conduct and your 14-day cooling-off right.",
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
        Study Lab Co is a GCSE Science tutoring business run by a sole trader in Blackburn, Lancashire. You can contact us at{" "}
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
        <li>
          Group sessions have a limited number of seats. A group pass is 6 or 10 group sessions at your child&apos;s level
          (KS3 or GCSE), paid by bank transfer. You can book sessions with it once we&apos;ve received the payment; it then
          lasts {s.passValidityMonths} months, and each session must be booked at least {s.passMinNoticeDays} days ahead. A
          Sunday bundle uses 2 sessions of a GCSE pass. Sessions not used by the end of the pass expire.
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
        <li>If you owe money for a lesson, you can&apos;t make new bookings until it is paid or we agree to waive it.</li>
        <li>We may change our prices. A change never affects a booking you have already made.</li>
      </ul>

      <h2>Cancelling and missed lessons</h2>
      <ul>
        <li>
          You can cancel free of charge from your account up to {s.cancellationNoticeHours} hours before the lesson starts.
        </li>
        <li>
          You can also cancel free of charge at any time in the first 14 days after making a booking, however close the
          lesson is. This is your cooling-off period (see below). For a group pass, the 14 days count from when you bought
          the pass: cancel it in that time and the value of the sessions you have not used goes back as account credit.
          After that, unused sessions can&apos;t be refunded.
        </li>
        <li>When a cancellation is free, any money you have paid is refunded or kept as credit.</li>
        <li>
          If you cancel less than {s.cancellationNoticeHours} hours before the lesson and more than 14 days after making the
          booking, please call or email us to cancel (the website cancels lessons at least {s.cancellationNoticeHours} hours away). It is recorded as a late cancellation and a
          late cancellation fee is due. The fee is {s.lateFeePercent}% of the lesson price (not any travel fee).
        </li>
        <li>If the student doesn&apos;t attend without cancelling, it is recorded as a no-show and the same {s.lateFeePercent}% fee is due, plus the travel fee for a home visit.</li>
        <li>In an emergency, please tell us. We can waive the fee.</li>
        <li>
          If late cancellations or no-shows happen repeatedly, we may talk to you about it and may stop taking new bookings from
          the account.
        </li>
        <li>The full details are in our <Link href="/refunds">Refund Policy</Link>.</li>
      </ul>

      <h2>If we cancel</h2>
      <p>
        Occasionally we may have to cancel a lesson or a group session, for example because of illness. We will tell you as
        soon as we can. You are not charged, and anything you have paid for that lesson is refunded or kept as credit, as you
        prefer.
      </p>

      <h2>Your 14-day cooling-off right</h2>
      <p>
        Under the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 you have 14 days from
        making a booking to change your mind. During those 14 days you can cancel any lesson in the booking that hasn&apos;t
        taken place yet, free of charge, even if it is less than {s.cancellationNoticeHours} hours away. Anything you have paid
        for it is refunded or kept as credit.
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
