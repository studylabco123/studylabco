import Link from "next/link";
import { LegalPage } from "@/components/site/LegalPage";
import { Table, Td, Th } from "@/components/ui/Table";
import { publicSettings } from "@/lib/public/data";
import { pageMetadata } from "@/lib/public/meta";
import { FALLBACK_EMAIL } from "@/lib/site";

export const metadata = pageMetadata(
  "Refund Policy",
  "What happens when you cancel a Study Lab Co lesson, when a late cancellation fee applies, and how refunds and credit work.",
  "/refunds",
);

export default async function RefundsPage() {
  const s = await publicSettings();
  const h = s.cancellationNoticeHours;
  const fee = `${s.lateFeePercent}%`;
  const rows: [string, string][] = [
    [
      `You cancel ${h} hours or more before the lesson`,
      "Free, from your account. The slot reopens. Anything you have paid becomes account credit.",
    ],
    [
      "You cancel within 14 days of making the booking (your cooling-off period)",
      `Free, even if the lesson is less than ${h} hours away (with less than ${h} hours to go, call or email us). Anything you have paid becomes account credit.`,
    ],
    [
      `You cancel less than ${h} hours before the lesson, more than 14 days after booking`,
      `With less than ${h} hours to go, please call or email Study Lab Co to cancel; the website only cancels lessons at least ${h} hours away. It is recorded as a late cancellation and a late cancellation fee of ${fee} of the lesson price is due (never the travel fee).`,
    ],
    [
      "The student doesn't attend (no-show)",
      `Recorded as a no-show. The same ${fee} late cancellation fee is due, plus the travel fee for a home visit.`,
    ],
    ["You owe money for a lesson", "New bookings are paused until it is paid, or the tutor decides not to charge it."],
    [
      "Late cancellations or no-shows happen repeatedly",
      "The account is flagged for the tutor to review. The tutor decides what happens next; nothing is blocked automatically.",
    ],
    ["An emergency", "Tell us. The tutor can choose not to charge the fee."],
    [
      "The tutor cancels",
      "You are not charged. Anything you have paid becomes account credit or is refunded, and a group pass session goes back on your pass.",
    ],
    [
      "Your child misses a session booked with a group pass",
      `Cancel with at least ${h} hours' notice and the session goes back on your pass. Later than that (call or email us), or a no-show, the session still goes back on your pass and a late cancellation fee of ${fee} of one session's value is due.`,
    ],
    [
      "You cancel a group pass",
      "Within 14 days of buying it, the value of the sessions you have not used becomes account credit (or nothing is owed if you had not paid). After that, unused sessions aren't refunded unless the tutor decides otherwise.",
    ],
    ["You have account credit and want the money back", `Email ${FALLBACK_EMAIL} and we will refund it to your card or bank account.`],
  ];
  return (
    <LegalPage
      title="Refund Policy"
      path="/refunds"
      intro="What happens to your booking and your money when plans change."
    >
      <h2>At a glance</h2>
      <Table caption="What happens when a lesson is cancelled or missed" hideCaption>
        <thead>
          <tr>
            <Th>Situation</Th>
            <Th>What happens</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([situation, result]) => (
            <tr key={situation}>
              <th scope="row" className="border-b border-sky-200 px-4 py-3 align-top font-display font-medium">
                {situation}
              </th>
              <Td>{result}</Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <h2>The late cancellation fee</h2>
      <p>
        The late cancellation fee is {s.lateFeePercent}% of the lesson price. It applies when you cancel with less than {h} hours
        to go (by phone or email, as the website only cancels lessons at least {h} hours away) and more than 14 days after
        booking. It never includes the travel fee for a home visit. If a student does not attend without cancelling, the same{" "}
        {s.lateFeePercent}% fee is due, plus the travel fee for a home visit. There are no other charges. If you have already paid
        in full, we keep the fee and the rest becomes account credit; if not, the fee is owed. For a group pass session the fee
        is {s.lateFeePercent}% of one session&apos;s value (the pass price divided by its number of sessions). The tutor can
        choose not to charge the fee.
      </p>

      <h2>Refunds and credit</h2>
      <ul>
        <li>
          When money is due back to you, it becomes account credit, which the tutor uses towards a future lesson. You can see
          your credit on your account page.
        </li>
        <li>
          Want it refunded to your card instead? Email <a href={`mailto:${FALLBACK_EMAIL}`}>{FALLBACK_EMAIL}</a>. This applies to
          any credit, including credit from a group pass cancelled within 14 days of buying it.
        </li>
        <li>Refunds are made to your card or bank account, or in cash if you paid in cash, normally within 14 days of asking.</li>
        <li>Unused group pass sessions are not refunded as money, except as described above.</li>
        <li>
          Your 14-day cooling-off right is explained in our <Link href="/terms">Terms of Service</Link>.
        </li>
      </ul>

      <h2>How to cancel</h2>
      <p>
        If the lesson is at least {h} hours away, log in, open the booking and choose Cancel. The page shows whether the
        cancellation is free before you confirm. With less than {h} hours to go, or if you can&apos;t log in, call us or email{" "}
        <a href={`mailto:${FALLBACK_EMAIL}`}>{FALLBACK_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
