import Link from "next/link";
import { GroupList } from "@/components/site/GroupList";
import { Hero } from "@/components/site/Hero";
import { HowItWorks } from "@/components/site/HowItWorks";
import { PriceTable, type PriceRow } from "@/components/site/PriceTable";
import { ButtonLink } from "@/components/ui/Button";
import { testimonials } from "@/content/testimonials";
import { formatPence } from "@/lib/format";
import { bookHref, loadUpcomingGroups, publicSettings } from "@/lib/public/data";
import { pageMetadata } from "@/lib/public/meta";
import { lessonPrices } from "@/lib/public/prices";

export const metadata = pageMetadata(
  null,
  "GCSE Biology, Chemistry, Physics and Combined Science tuition in Blackburn from a qualified teacher (QTS), enhanced DBS checked. Years 10 and 11, all exam boards.",
  "/",
);

/** Links that stand on their own line: a 44px tall hit area. */
const standaloneLink =
  "inline-flex min-h-11 items-center font-display font-semibold underline decoration-sky-500 decoration-2 underline-offset-4 transition-[text-decoration-color] duration-150 hover:decoration-navy-900";

const FACTS: [string, string][] = [
  ["Subjects", "Biology, Chemistry, Physics and Combined Science"],
  ["Exam boards", "AQA, Edexcel, OCR and WJEC/Eduqas"],
  ["Tiers", "Foundation and Higher"],
  ["Who for", "Years 10 and 11 (GCSE)"],
];

const CREDENTIALS = [
  "PGCE with Qualified Teacher Status (QTS), Edge Hill University",
  "BSc Biology, University of Salford",
  "A-Levels in Biology, Chemistry and Psychology",
  "Grade 9 in GCSE Science",
  "Enhanced DBS checked",
];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const [settings, href, groups] = await Promise.all([publicSettings(), bookHref(), loadUpcomingGroups(new Date(), { limit: 3 })]);
  const p = lessonPrices(settings);
  const home = settings.homeVisitsEnabled;
  const place = settings.tutorPlaceEnabled;

  const at = (pence: number, testId?: string) => ({ label: place ? "At the tutor's place" : "Per lesson", pence, testId });
  const rows: PriceRow[] = [
    {
      name: "Assessment Lesson",
      detail: "Every new student's first lesson: 60 minutes, including a 15-minute talk with you.",
      prices: [at(p.assessment), ...(home ? [{ label: "Home visit", pence: p.assessmentHome }] : [])],
    },
    {
      name: "1-to-1 lesson",
      detail: "60 minutes on your child's own targets and weak spots.",
      prices: [at(p.oneToOne), ...(home ? [{ label: "Home visit", pence: p.oneToOneHome }] : [])],
    },
    {
      name: "Group session",
      detail: "60 minutes in a small weekend group working through GCSE topics and exam questions.",
      prices: [{ label: "Per student", pence: p.group }],
    },
    {
      name: "Sunday bundle",
      detail: "Both Sunday morning groups, back to back.",
      prices: [{ label: "Per student", pence: p.sundayBundle }],
    },
  ];

  return (
    <>
      {notice === "account-deleted" ? (
        <p role="status" className="bg-success-50 px-5 py-3 text-center text-success-700">
          Your account has been deleted.
        </p>
      ) : null}

      <Hero assessmentPence={p.assessment} assessmentHomePence={home ? p.assessmentHome : null} bookHref={href} />

      <section aria-label="What is taught" className="border-b border-sky-200 bg-white">
        <dl className="mx-auto grid max-w-content gap-x-8 gap-y-5 px-5 py-8 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
          {FACTS.map(([term, value]) => (
            <div key={term} className="border-l-2 border-sky-300 pl-4">
              <dt className="text-fine text-navy-600">{term}</dt>
              <dd className="font-display text-small font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="how-it-works">
        <div className="mx-auto max-w-content px-5 py-16 sm:px-8 md:py-24">
          <div className="grid gap-4 md:grid-cols-12">
            <h2 id="how-it-works" className="text-h2 md:col-span-5">
              How it works
            </h2>
            <p className="max-w-prose text-navy-600 md:col-span-7">
              Everything is booked through your account, where you can see the free times.{" "}
              {settings.homeVisitsEnabled
                ? "Lessons at the tutor's place are confirmed straight away; a home visit is confirmed once the tutor has approved it."
                : "Lessons are confirmed straight away."}
            </p>
          </div>
          <HowItWorks assessmentPence={p.assessment} />
          <div className="mt-12 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={href} size="lg" className="w-full sm:w-auto">
              Book your {formatPence(p.assessment)} Assessment Lesson
            </ButtonLink>
          </div>
        </div>
      </section>

      <section aria-labelledby="lessons" className="border-y border-sky-200 bg-sky-50">
        <div className="mx-auto grid max-w-content gap-10 px-5 py-16 sm:px-8 md:grid-cols-12 md:py-24">
          <div className="flex flex-col gap-4 md:col-span-4">
            <h2 id="lessons" className="text-h2">
              Lessons and prices
            </h2>
            <p className="text-navy-600">
              All lessons last 60 minutes. Pay by bank transfer in advance, or by cash before the lesson starts. No VAT,
              no joining fee: the price you see is the price you pay.
            </p>
            <p>
              <Link href="/lessons" className={standaloneLink}>
                Full prices, group passes and times
              </Link>
            </p>
          </div>
          <PriceTable label="Lesson prices" rows={rows} className="md:col-span-8" />
        </div>
      </section>

      <section aria-labelledby="teacher">
        <div className="mx-auto grid max-w-content gap-10 px-5 py-16 sm:px-8 md:grid-cols-12 md:py-24">
          <div className="flex flex-col gap-4 md:col-span-6">
            <h2 id="teacher" className="text-h2">
              Taught by a qualified science teacher
            </h2>
            <p className="text-navy-600">
              Lessons are planned and taught by a trained secondary science teacher with Qualified Teacher Status, and
              follow your child&apos;s exam board specification.
            </p>
            <p>
              <Link href="/about" className={standaloneLink}>
                About the tutor
              </Link>
            </p>
          </div>
          <ul aria-label="Qualifications and checks" className="flex flex-col gap-3 md:col-span-6">
            {CREDENTIALS.map((c) => (
              <li key={c} className="flex items-start gap-3 border-b border-sky-200 pb-3 last:border-b-0">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-1 size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5 10 17.5 19 7" />
                </svg>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="groups" className="border-y border-sky-200 bg-sky-50">
        <div className="mx-auto max-w-content px-5 py-16 sm:px-8 md:py-24">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3">
              <h2 id="groups" className="text-h2">
                Upcoming group sessions
              </h2>
              <p className="max-w-prose text-navy-600">Weekend groups for students who have had their Assessment Lesson.</p>
            </div>
            <Link href="/groups" className={standaloneLink}>
              All group sessions
            </Link>
          </div>
          <GroupList groups={groups} bookHref={href} label="Next group sessions" />
        </div>
      </section>

      {testimonials.length > 0 ? (
        <section aria-labelledby="testimonials" data-testid="testimonials">
          <div className="mx-auto max-w-content px-5 py-16 sm:px-8 md:py-24">
            <h2 id="testimonials" className="text-h2">
              What parents say
            </h2>
            <ul className="mt-8 grid gap-6 md:grid-cols-2">
              {testimonials.map((t) => (
                <li key={t.quote}>
                  <figure className="flex h-full flex-col gap-4 border-l-4 border-sky-300 pl-5">
                    <blockquote className="text-lead">&ldquo;{t.quote}&rdquo;</blockquote>
                    <figcaption className="text-small text-navy-600">{t.attribution}</figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="start" className="bg-graph">
        <div className="mx-auto flex max-w-content flex-col items-center gap-5 px-5 py-16 text-center sm:px-8 md:py-20">
          <h2 id="start" className="max-w-[24ch] text-h2">
            Start with one lesson and a conversation
          </h2>
          <p className="max-w-prose text-navy-600">
            The Assessment Lesson shows where your child is now and what to work on first. There&apos;s no obligation to
            book more.
          </p>
          <ButtonLink href={href} size="lg">
            Book your {formatPence(p.assessment)} Assessment Lesson
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
