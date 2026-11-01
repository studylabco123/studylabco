import Link from "next/link";
import type { ReactNode } from "react";
import { PageIntro } from "@/components/site/PageIntro";
import { formatPence } from "@/lib/format";
import { bookingWindowText } from "@/lib/policy";
import { publicSettings } from "@/lib/public/data";
import { pageMetadata } from "@/lib/public/meta";
import { coolingOffSummary, passSummary } from "@/lib/public/price-info";
import { GROUP_LEVEL_LABEL, lessonPrices, noticeDaysText, YEAR9_NOTE } from "@/lib/public/prices";
import { FALLBACK_EMAIL } from "@/lib/site";

export const metadata = pageMetadata(
  "Common questions and answers",
  "Plain-English answers about booking, prices, KS3, GCSE and Year 9, group passes, cancelling and the late cancellation fee, the 14-day cooling-off right, credit and refunds, paying, test results and safeguarding.",
  "/faq",
);

type QA = { q: string; a: ReactNode };

const link = "font-semibold underline decoration-sky-500 decoration-2 underline-offset-4";

export default async function FaqPage() {
  const s = await publicSettings();
  const p = lessonPrices(s);
  const areas = s.allowedPostcodeDistricts.join(" and ");
  const h = s.cancellationNoticeHours;
  const fee = `${s.lateFeePercent}%`;
  const home = s.homeVisitsEnabled;
  const pass = (level: "KS3" | "GCSE", n: "6" | "10") => formatPence(s.passPrices[level][n]);
  const mail = (
    <a href={`mailto:${FALLBACK_EMAIL}`} className={link}>
      {FALLBACK_EMAIL}
    </a>
  );
  const groups: { id: string; title: string; items: QA[] }[] = [
    {
      id: "booking",
      title: "Booking",
      items: [
        {
          q: "How do I book?",
          a: (
            <>
              Create an account as the parent or guardian, add your child and sign the agreement form. It takes about five
              minutes. Then book the Assessment Lesson from your account, where you can see the free times and book without
              waiting for a reply.{home ? " The one exception is a home visit, which is confirmed once the tutor has approved it." : ""}
            </>
          ),
        },
        {
          q: "Why does every new student start with an Assessment Lesson?",
          a: "So lessons are planned around what your child actually needs. It's a 60-minute lesson that shows which topics are secure and which need work.",
        },
        {
          q: "Do I need to be there for the Assessment Lesson?",
          a: "Yes. The last 15 minutes are a talk with you, the parent or guardian, about how it went and what to do next, so please be present for it.",
        },
        {
          q: "What happens after it?",
          a: "The tutor approves your child as a student, and you can then book 1-to-1 lessons, group sessions or a group pass from your account.",
        },
        {
          q: "How far ahead can I book?",
          a: `Up to ${bookingWindowText(s.bookingWindowDays)} ahead, and at least ${s.minNoticeHours} hours before the lesson. Sessions with a group pass are booked at least ${noticeDaysText(s.passMinNoticeDays)} ahead.`,
        },
        {
          q: "Where do lessons take place?",
          a: `At the tutor's place in Blackburn${home ? `, or at your home on Sundays (${areas} postcodes)` : ""}. The address is sent in your booking confirmation. Group sessions show their venue when you book.`,
        },
        ...(home
          ? [
              {
                q: "Does someone need to be at home for a home visit?",
                a: "Yes. A parent, guardian or another responsible adult must be at home for the whole lesson.",
              },
            ]
          : []),
      ],
    },
    {
      id: "prices",
      title: "Prices",
      items: [
        {
          q: "How much are lessons?",
          a: (
            <ul className="flex list-disc flex-col gap-1 pl-5">
              <li>
                Assessment Lesson: {formatPence(p.ks3Assessment)} for KS3 (Years 7–8), {formatPence(p.assessment)} for GCSE and
                every Year 9 student.
              </li>
              <li>
                1-to-1 lesson: {formatPence(p.ks3OneToOne)} for KS3, {formatPence(p.oneToOne)} for GCSE.
              </li>
              <li>
                Group session: {formatPence(p.ks3Group)} for KS3, {formatPence(p.group)} for GCSE. The Sunday bundle (both Sunday
                GCSE sessions) is {formatPence(p.sundayBundle)}.
              </li>
              <li>
                Group passes: KS3 {pass("KS3", "6")} for 6 sessions or {pass("KS3", "10")} for 10; GCSE {pass("GCSE", "6")} for 6
                or {pass("GCSE", "10")} for 10.
              </li>
              {home ? <li>A home visit adds a {formatPence(p.travel)} travel fee.</li> : null}
            </ul>
          ),
        },
        {
          q: "Are there any other charges?",
          a: (
            <>
              No VAT and no joining or admin fees. The only other charge is the late cancellation fee if you cancel late or your
              child misses a lesson (see below). All prices are on{" "}
              <Link href="/lessons" className={link}>
                Lessons and prices
              </Link>
              .
            </>
          ),
        },
        {
          q: "If prices change, do I pay more for lessons I've booked?",
          a: "No. A price change never affects a booking you have already made.",
        },
      ],
    },
    {
      id: "levels",
      title: "KS3, GCSE and Year 9",
      items: [
        {
          q: "Which year groups do you teach?",
          a: "Years 7 to 11. Years 7–8 are KS3 and Years 10–11 are GCSE. KS3 lessons cover KS3 Science; GCSE lessons cover Biology, Chemistry, Physics and Combined Science.",
        },
        { q: "My child is in Year 9. KS3 or GCSE?", a: YEAR9_NOTE },
        {
          q: "Which groups can my child join?",
          a: `Groups are for one level. The KS3 groups are ${GROUP_LEVEL_LABEL.KS3}. The GCSE groups are ${GROUP_LEVEL_LABEL.GCSE}. When you book, you only see the groups for your child's level.`,
        },
        {
          q: "Which exam boards do you teach?",
          a: "AQA, Edexcel, OCR and WJEC/Eduqas at GCSE. Lessons follow your child's own specification, including its required practicals.",
        },
        {
          q: "Foundation or Higher tier?",
          a: "Both. If you're not sure which tier your child is entered for, their school can tell you, and we can talk it through at the Assessment Lesson.",
        },
      ],
    },
    {
      id: "passes",
      title: "Group passes",
      items: [
        { q: "What is a group pass?", a: passSummary(s) },
        {
          q: "How much is a pass?",
          a: `KS3: ${pass("KS3", "6")} for 6 sessions or ${pass("KS3", "10")} for 10. GCSE: ${pass("GCSE", "6")} for 6 sessions or ${pass("GCSE", "10")} for 10. A pass is for one child, at their level.`,
        },
        {
          q: "When can we start using it?",
          a: `Pay by bank transfer. The sessions unlock once we've received your payment, and the pass then lasts ${s.passValidityMonths} months. Book each session from your account at least ${noticeDaysText(s.passMinNoticeDays)} ahead; you don't have to choose all the dates at once. Sessions not used by the end of the pass expire.`,
        },
        {
          q: "Can I use a pass for the Sunday bundle?",
          a: "Yes, with a GCSE pass. A Sunday bundle (both Sunday sessions) uses 2 sessions.",
        },
        {
          q: "What if my child misses a pass session?",
          a: `Cancel at least ${h} hours before and the session goes back on your pass. With less than ${h} hours to go (call or email us), or if your child doesn't come, the session still goes back on your pass, but a late cancellation fee of ${fee} of one session's value is due.`,
        },
        {
          q: "Can I get a refund for a pass?",
          a: "Unused sessions aren't refunded as money. If you change your mind within 14 days of buying the pass, the sessions you haven't used become account credit, which you can ask us to refund. After the 14 days, unused sessions aren't refunded unless the tutor decides otherwise.",
        },
      ],
    },
    {
      id: "cancelling",
      title: "Cancelling and the late cancellation fee",
      items: [
        {
          q: "How do I cancel?",
          a: `If the lesson is at least ${h} hours away, cancel from your account. It's free, and if you had paid, the money becomes account credit.`,
        },
        {
          q: `What if there are less than ${h} hours to go?`,
          a: (
            <>
              You can&apos;t cancel on the website: please call or email Study Lab Co. Unless you are still in your 14-day
              cooling-off period, it is a late cancellation and a late cancellation fee of {s.lateFeePercent}% of the lesson price
              is due (never the travel fee). If you had already paid in full, we keep the fee and the rest becomes credit.
            </>
          ),
        },
        {
          q: "What if my child doesn't come?",
          a: `It is recorded as a no-show and the same ${fee} fee is due, plus the travel fee for a home visit, because the tutor has travelled to you.`,
        },
        {
          q: "What if something urgent comes up?",
          a: "Please tell us. In an emergency the tutor can choose not to charge the fee.",
        },
        {
          q: "What if the tutor has to cancel?",
          a: "You are not charged. Anything you have paid becomes account credit or is refunded, and a session booked with a group pass goes back on your pass.",
        },
        {
          q: "Where are the full rules?",
          a: (
            <>
              In our{" "}
              <Link href="/refunds" className={link}>
                Refund Policy
              </Link>{" "}
              and{" "}
              <Link href="/terms" className={link}>
                Terms of Service
              </Link>
              .
            </>
          ),
        },
      ],
    },
    {
      id: "cooling-off",
      title: "Your 14-day cooling-off right",
      items: [
        { q: "What is the cooling-off period?", a: coolingOffSummary(s) },
        {
          q: "Can lessons start within the 14 days?",
          a: "Yes. When you book, tick the box to ask for lessons to start within 14 days. You can still cancel any lesson that hasn't taken place yet free of charge, but a lesson that has already taken place can't be cancelled.",
        },
        {
          q: "How do I cancel in the cooling-off period?",
          a: `From your account if the lesson is at least ${h} hours away; otherwise call or email us and we will cancel it free of charge.`,
        },
      ],
    },
    {
      id: "money",
      title: "Credit, refunds and paying",
      items: [
        {
          q: "How do I pay?",
          a: "By bank transfer in advance, or by cash or bank transfer before the lesson starts. Group passes are paid by bank transfer. Each booking has its own payment reference. There is no card payment on the website.",
        },
        {
          q: "Where do I find the bank details?",
          a: "In your booking confirmation email and on the booking page in your account. They are not published on the website.",
        },
        {
          q: "What is account credit?",
          a: "Money we hold for you, for example when a paid lesson is cancelled free of charge, or when you cancel a group pass within 14 days of buying it. You can see it on your account page, and the tutor uses it towards a future lesson.",
        },
        {
          q: "Can I have my credit refunded instead?",
          a: <>Yes, at any time. Email {mail} and we will refund it to your bank account, normally within 14 days.</>,
        },
      ],
    },
    {
      id: "results",
      title: "Test results",
      items: [
        {
          q: "Will I see how my child is doing?",
          a: "Yes. After an assessment or an end-of-topic test, the tutor adds the result to your account: the score, what went well and what to improve, and sometimes a photo or PDF of the marked test. We email you when there is a new result.",
        },
        {
          q: "Who can see the results?",
          a: "Only you, when you are logged in, and the tutor. Results are never sent in the email itself.",
        },
      ],
    },
    {
      id: "safeguarding",
      title: "Safeguarding",
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
          q: "Who teaches the lessons?",
          a: "The tutor teaches every lesson personally. Lessons are never passed to anyone else.",
        },
        {
          q: "Do children have their own accounts?",
          a: "No. Only a parent or guardian aged 18 or over can open an account and book, and all messages about lessons go to you.",
        },
      ],
    },
  ];

  return (
    <>
      <PageIntro title="Common questions and answers">
        <p>The things parents ask most, in plain English. Select a question to see the answer.</p>
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
        <p className="border-t-2 border-navy-900 pt-6 font-display text-h3 font-semibold">
          Still have a question? Email {mail}
        </p>
      </div>
    </>
  );
}
