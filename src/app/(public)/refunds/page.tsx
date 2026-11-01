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
  const rows: [string, string][] = [
    [
      `You cancel ${h} hours or more before the lesson`,
      "Free. The slot reopens. Anything you have paid is refunded or kept as credit, as you prefer.",
    ],
    [
      "You cancel within 14 days of making the booking (your cooling-off period)",
      `Free, even if the lesson is less than ${h} hours away. Anything you have paid is refunded or kept as credit.`,
    ],
    [
      `You cancel less than ${h} hours before the lesson, more than 14 days after booking`,
      "You can still cancel from your account, after a clear warning. It is recorded as a late cancellation and the late cancellation fee is due.",
    ],
    ["The student doesn't attend (no-show)", "Recorded as a no-show. The lesson price is due."],
    ["You owe money for a lesson", "New bookings are paused until it is paid or waived."],
    [
      "Late cancellations or no-shows happen repeatedly",
      "The account is flagged for the tutor to review. The tutor decides what happens next; nothing is blocked automatically.",
    ],
    ["An emergency", "Tell us. The tutor can waive the fee."],
    ["The tutor cancels", "You are not charged. Anything you have paid is refunded or kept as credit."],
    [
      "Your child misses one week of a block booking",
      `The same rules apply to that week: free with ${h} hours' notice, or within 14 days of booking the block.`,
    ],
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
        The late cancellation fee is {s.lateFeePercent}% of the lesson price. It never includes the travel fee for a home visit. If a
        student does not attend without cancelling, the same {s.lateFeePercent}% fee is due, plus the travel fee for a home visit. There
        are no other charges. If you have already paid, the payment covers the fee; if not, the fee is owed.
      </p>

      <h2>Refunds and credit</h2>
      <ul>
        <li>When money is due back to you, we either refund it to you or keep it as credit towards future lessons. Tell us which you prefer.</li>
        <li>Refunds are made by bank transfer, or in cash if you paid in cash, normally within 14 days.</li>
        <li>
          Your 14-day cooling-off right is explained in our <Link href="/terms">Terms of Service</Link>.
        </li>
      </ul>

      <h2>How to cancel</h2>
      <p>
        Log in, open the booking and choose Cancel. The page shows whether the cancellation is free before you confirm. If you
        can&apos;t log in, email <a href={`mailto:${FALLBACK_EMAIL}`}>{FALLBACK_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
