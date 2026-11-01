import Link from "next/link";
import type { ReactNode } from "react";
import { PageIntro } from "@/components/site/PageIntro";
import { formatPence } from "@/lib/format";
import { publicSettings } from "@/lib/public/data";
import { pageMetadata } from "@/lib/public/meta";

export const metadata = pageMetadata(
  "Questions and answers",
  "Answers about exam boards, tiers, the Assessment Lesson, paying for lessons, cancelling and keeping students safe.",
  "/faq",
);

type QA = { q: string; a: ReactNode };

const link = "font-semibold underline decoration-sky-500 decoration-2 underline-offset-4";

export default async function FaqPage() {
  const s = await publicSettings();
  const areas = s.allowedPostcodeDistricts.join(" and ");
  const groups: { id: string; title: string; items: QA[] }[] = [
    {
      id: "courses",
      title: "Subjects and exams",
      items: [
        {
          q: "Which exam boards do you teach?",
          a: "AQA, Edexcel, OCR and WJEC/Eduqas. Lessons follow your child's own specification, including its required practicals.",
        },
        {
          q: "Foundation or Higher tier?",
          a: "Both. If you're not sure which tier your child is entered for, their school can tell you, and we can talk it through at the Assessment Lesson.",
        },
        {
          q: "Which year groups?",
          a: "Years 10 and 11 (GCSE). Biology, Chemistry, Physics and Combined Science.",
        },
      ],
    },
    {
      id: "assessment",
      title: "The Assessment Lesson",
      items: [
        {
          q: "Why does every new student start with an Assessment Lesson?",
          a: "So lessons are planned around what your child actually needs. It's a 60-minute lesson that shows which topics are secure and which need work.",
        },
        {
          q: "Do I need to be there?",
          a: "Yes. The last 15 minutes are a talk with you, the parent or guardian, about how it went and what to do next, so please be present for it.",
        },
        {
          q: "How much is it?",
          a: (
            <>
              {formatPence(s.priceAssessmentPence)} at the tutor&apos;s place
              {s.homeVisitsEnabled ? (
                <>
                  , or {formatPence(s.priceAssessmentPence + s.travelFeePence)} as a home visit on a Sunday ({areas} postcodes only)
                </>
              ) : null}
              .
            </>
          ),
        },
        {
          q: "What happens after it?",
          a: "The tutor approves your child as a student, and you can then book 1-to-1 lessons, group sessions or a group pass from your account.",
        },
      ],
    },
    {
      id: "paying",
      title: "Paying and cancelling",
      items: [
        {
          q: "How do I pay?",
          a: "By bank transfer in advance, or by cash or bank transfer before the lesson starts. Each booking has its own payment reference. There is no card payment on the website.",
        },
        {
          q: "Where do I find the bank details?",
          a: "In your booking confirmation email and on the booking page in your account. They are not published on the website.",
        },
        {
          q: "What if we need to cancel?",
          a: (
            <>
              Cancel free from your account up to {s.cancellationNoticeHours} hours before the lesson, or at any time in the first
              14 days after booking (your cooling-off period). Inside that time, please call or email us to cancel. Cancelling later than that, or your child not coming,
              means a late cancellation fee of {s.lateFeePercent}% of the lesson price is due (a no-show is the same {s.lateFeePercent}%, plus the travel fee for a home visit). Read the{" "}
              <Link href="/refunds" className={link}>
                Refund Policy
              </Link>
              .
            </>
          ),
        },
        {
          q: "What if the tutor has to cancel?",
          a: "You are not charged. Anything you have paid for that lesson is refunded or kept as credit, whichever you prefer.",
        },
      ],
    },
    {
      id: "safety",
      title: "Safety and locations",
      items: [
        {
          q: "Is the tutor DBS checked?",
          a: (
            <>
              Yes, the tutor holds an enhanced DBS check and is a qualified teacher (QTS). See{" "}
              <Link href="/safeguarding" className={link}>
                Safeguarding
              </Link>
              .
            </>
          ),
        },
        {
          q: "Where do lessons take place?",
          a: `At the tutor's place in Blackburn${s.homeVisitsEnabled ? `, or at your home on Sundays (${areas} postcodes)` : ""}. The address is sent in your booking confirmation. Group sessions show their venue when you book.`,
        },
        ...(s.homeVisitsEnabled
          ? [
              {
                q: "Does someone need to be at home for a home visit?",
                a: "Yes. A parent, guardian or another responsible adult must be at home for the whole lesson.",
              },
            ]
          : []),
      ],
    },
  ];

  return (
    <>
      <PageIntro title="Questions and answers">
        <p>
          The things parents ask most. Can&apos;t find your answer?{" "}
          <Link href="/contact" className={link}>
            Send a message
          </Link>
          .
        </p>
      </PageIntro>
      <div className="mx-auto flex max-w-content flex-col gap-14 px-5 py-12 sm:px-8 md:py-16">
        {groups.map((g) => (
          <section key={g.id} aria-labelledby={g.id} className="grid gap-6 md:grid-cols-12">
            <h2 id={g.id} className="text-h2 md:col-span-4">
              {g.title}
            </h2>
            <div className="flex flex-col divide-y divide-sky-200 border-y border-sky-200 md:col-span-8">
              {g.items.map((item) => (
                <details key={item.q} className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-display text-lead font-medium [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="size-6 shrink-0 transition-transform duration-200 ease-out group-open:rotate-45 motion-reduce:transition-none"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </summary>
                  <div className="max-w-prose pb-5 text-navy-600">{item.a}</div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
