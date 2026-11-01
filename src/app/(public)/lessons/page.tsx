import Link from "next/link";
import { PageIntro, Section } from "@/components/site/PageIntro";
import { PriceTable, type PriceRow } from "@/components/site/PriceTable";
import { Steps } from "@/components/site/Steps";
import { ButtonLink } from "@/components/ui/Button";
import { formatPence } from "@/lib/format";
import { bookingWindowText } from "@/lib/policy";
import { bookHref, loadGroupSeries, publicSettings } from "@/lib/public/data";
import { pageMetadata } from "@/lib/public/meta";
import { priceInfo, passSummary } from "@/lib/public/price-info";
import { GROUP_LEVEL_LABEL, groupTimesByDay, lessonPrices, noticeDaysText, passOffers, YEAR9_NOTE } from "@/lib/public/prices";
import type { Level } from "@/lib/types";

export const metadata = pageMetadata(
  "Lessons and prices",
  "KS3 and GCSE Science prices: the Assessment Lesson, 1-to-1 lessons, weekend group sessions and group passes, plus when lessons run and how new students get started.",
  "/lessons",
);

function list(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function LessonsPage() {
  const [settings, href, series] = await Promise.all([publicSettings(), bookHref(), loadGroupSeries()]);
  const p = lessonPrices(settings);
  const home = settings.homeVisitsEnabled;
  const place = settings.tutorPlaceEnabled;
  const areas = list(settings.allowedPostcodeDistricts);
  const offers = passOffers(settings);
  const homeNote = `Sundays, ${areas}`;
  const placeLabel = place ? "At the tutor's place" : "Per lesson";

  /** Weekdays a level's groups run on, e.g. "Saturday mornings". */
  const groupDays = (level: Level) => {
    const days = [...new Set(series.filter((x) => x.level === level).map((x) => x.weekday))].map((d) => DAY_NAMES[d]);
    return days.length ? ` on ${list(days)} mornings` : "";
  };

  const lesson = (name: string, level: Level, opts: { place: number; home: number; testId: string; detail: string; info: string }): PriceRow => ({
    name,
    detail: opts.detail,
    prices: [
      { label: placeLabel, pence: opts.place, testId: opts.testId, info: { label: `the ${level} ${name} price`, text: opts.info } },
      ...(home
        ? [
            {
              label: "Home visit",
              pence: opts.home,
              note: homeNote,
              testId: `${opts.testId}-home`,
              info: { label: `the ${level} ${name} home visit price`, text: priceInfo.homeVisit(settings) },
            },
          ]
        : []),
    ],
  });

  const passRow = (level: Level, testPrefix: string): PriceRow => ({
    name: "Group pass",
    detail: `6 or 10 ${level} group sessions for one child, at a lower price. Valid for ${settings.passValidityMonths} months once paid.`,
    prices: offers
      .filter((o) => o.level === level)
      .map((o) => ({
        label: `${o.sessions} sessions`,
        pence: o.pricePence,
        testId: `${testPrefix}-pass-${o.sessions}`,
        note: o.savingPence > 0 ? <span className="font-semibold text-success-700">Save {formatPence(o.savingPence)}</span> : "Same as one by one",
        info: { label: `the ${level} group pass, ${o.sessions} sessions`, text: priceInfo.pass(level, o.sessions, o.pricePence, settings) },
      })),
  });

  const ks3Rows: PriceRow[] = [
    lesson("Assessment Lesson", "KS3", {
      place: p.ks3Assessment,
      home: p.ks3AssessmentHome,
      testId: "price-ks3-assessment",
      detail: "The first lesson for Years 7–8. 60 minutes, including a 15-minute talk with you. Year 9 books the GCSE Assessment Lesson.",
      info: priceInfo.assessment("KS3"),
    }),
    lesson("1-to-1 lesson", "KS3", {
      place: p.ks3OneToOne,
      home: p.ks3OneToOneHome,
      testId: "price-ks3-one-to-one",
      detail: "60 minutes, one student, planned around what they are learning at school.",
      info: priceInfo.oneToOne("KS3"),
    }),
    {
      name: "Group session",
      detail: `${GROUP_LEVEL_LABEL.KS3}. 60 minutes${groupDays("KS3")}, in a group of up to ${settings.defaultGroupCapacity} students.`,
      prices: [{ label: "Per student", pence: p.ks3Group, testId: "price-ks3-group", info: { label: "the KS3 group session price", text: priceInfo.group("KS3") } }],
    },
    passRow("KS3", "price-ks3"),
  ];

  const gcseRows: PriceRow[] = [
    lesson("Assessment Lesson", "GCSE", {
      place: p.assessment,
      home: p.assessmentHome,
      testId: "price-assessment",
      detail: "The first lesson for Years 10–11, and for every Year 9 student. 60 minutes, including a 15-minute talk with you.",
      info: priceInfo.assessment("GCSE"),
    }),
    lesson("1-to-1 lesson", "GCSE", {
      place: p.oneToOne,
      home: p.oneToOneHome,
      testId: "price-one-to-one",
      detail: "60 minutes, one student, planned around their targets, exam board and tier.",
      info: priceInfo.oneToOne("GCSE"),
    }),
    {
      name: "Group session",
      detail: `${GROUP_LEVEL_LABEL.GCSE}. 60 minutes${groupDays("GCSE")}, in a group of up to ${settings.defaultGroupCapacity} students.`,
      prices: [{ label: "Per student", pence: p.group, testId: "price-group", info: { label: "the GCSE group session price", text: priceInfo.group("GCSE") } }],
    },
    {
      name: "Sunday bundle",
      detail: "Both Sunday morning GCSE group sessions, back to back.",
      prices: [
        { label: "Per student", pence: p.sundayBundle, testId: "price-sunday-bundle", info: { label: "the Sunday bundle price", text: priceInfo.sundayBundle(settings) } },
      ],
    },
    passRow("GCSE", "price-gcse"),
  ];

  /** "Saturday: KS3 only (Years 7–9) group session at 8:15am", one line per day and level. */
  const weekendLines = [6, 0].flatMap((day) =>
    (["KS3", "GCSE"] as const).flatMap((level) => {
      const times = groupTimesByDay(series.filter((x) => x.level === level))[day];
      if (!times?.length) return [];
      return [`${DAY_NAMES[day]}: ${GROUP_LEVEL_LABEL[level]} group ${times.length > 1 ? "sessions" : "session"} at ${list(times)}`];
    }),
  );

  return (
    <>
      <PageIntro title="Lessons and prices">
        <p>
          Science lessons for KS3 (Years 7–9) and GCSE (Years 10–11). Every lesson lasts 60 minutes. Prices are final (Study
          Lab Co is not VAT registered) and there are no joining or admin fees.
        </p>
        <p className="mt-3 text-body font-semibold text-navy-900">{YEAR9_NOTE}</p>
      </PageIntro>

      <Section id="prices" title="Prices" intro="Select the i next to any price for a short explanation.">
        <div className="flex flex-col gap-12">
          <div className="flex flex-col gap-4">
            <h3 className="text-h3">KS3 — Years 7 to 9</h3>
            <PriceTable label="KS3 prices" rows={ks3Rows} />
          </div>
          <div className="flex flex-col gap-4">
            <h3 className="text-h3">GCSE — Years 10 and 11</h3>
            <PriceTable label="GCSE prices" rows={gcseRows} />
          </div>
        </div>
        {home ? (
          <p className="mt-6 max-w-prose text-small text-navy-600">
            A home visit adds a {formatPence(p.travel)} travel fee, already included in the home visit prices above. Home visits
            are on Sundays after the morning groups, for {areas} postcodes only, and are confirmed once the tutor has approved the
            request.
          </p>
        ) : null}
      </Section>

      <Section id="passes" title="How group passes work" tone="sky" intro={passSummary(settings)}>
        <ul className="flex max-w-prose list-disc flex-col gap-2 pl-5 text-navy-600">
          <li>A pass is for one child, at their level (KS3 or GCSE). Choose 6 or 10 sessions.</li>
          <li>
            Pay by bank transfer. Sessions unlock once we&apos;ve received your payment, and the pass then lasts{" "}
            {settings.passValidityMonths} months. Sessions not used by then expire.
          </li>
          <li>
            Book each session from your account at least {noticeDaysText(settings.passMinNoticeDays)} ahead, whenever suits you.
            You don&apos;t have to choose all the dates at once. A Sunday bundle uses 2 sessions of a GCSE pass.
          </li>
          <li>
            Cancel at least {settings.cancellationNoticeHours} hours before and the session goes back on your pass. Later than
            that, or if your child misses it, the session still goes back on your pass but a late cancellation fee of{" "}
            {settings.lateFeePercent}% of one session&apos;s value applies.
          </li>
          <li>
            Change your mind within 14 days of buying and the sessions you haven&apos;t used become account credit. After that,
            unused sessions aren&apos;t refunded. See the{" "}
            <Link href="/refunds" className="font-semibold text-navy-900 underline underline-offset-4">
              Refund Policy
            </Link>
            .
          </li>
        </ul>
      </Section>

      <Section id="times" title="When lessons run" intro={`Times change a little through the year. The booking calendar always shows the real free slots, up to ${bookingWindowText(settings.bookingWindowDays)} ahead.`}>
        <dl className="grid gap-6 md:grid-cols-2">
          <div className="border-l-2 border-sky-300 pl-4">
            <dt className="font-display font-semibold">Term time, Monday to Friday</dt>
            <dd className="text-navy-600">Early evening 1-to-1 and Assessment Lessons, after school.</dd>
          </div>
          <div className="border-l-2 border-sky-300 pl-4">
            <dt className="font-display font-semibold">Weekends</dt>
            <dd className="text-navy-600">
              {weekendLines.map((l) => (
                <span key={l} className="block">
                  {l}.
                </span>
              ))}
              <span className="block">Sunday: 1-to-1 and Assessment Lessons after the morning groups{home ? ", including home visits" : ""}.</span>
            </dd>
          </div>
          <div className="border-l-2 border-sky-300 pl-4">
            <dt className="font-display font-semibold">School holidays</dt>
            <dd className="text-navy-600">More weekday times, from morning to evening.</dd>
          </div>
          <div className="border-l-2 border-sky-300 pl-4">
            <dt className="font-display font-semibold">Booking</dt>
            <dd className="text-navy-600">
              Book at least {settings.minNoticeHours} hours ahead. Cancel free from your account up to{" "}
              {settings.cancellationNoticeHours} hours before the lesson, or at any time in the first 14 days after booking. With less
              than {settings.cancellationNoticeHours} hours to go, please call or email to cancel; after the first 14 days a late
              cancellation fee of {settings.lateFeePercent}% of the lesson price applies.
            </dd>
          </div>
        </dl>
      </Section>

      <Section id="new-students" title="New students start here" tone="sky">
        <Steps
          label="Steps for new students"
          steps={[
            {
              title: "Create an account",
              body: "Sign up as the parent or guardian, add your child (KS3 or GCSE) and sign the agreement form.",
            },
            {
              title: "Assessment Lesson",
              body: (
                <>
                  A 60-minute Assessment Lesson, including a <strong>15-minute talk with you</strong>.
                </>
              ),
            },
            { title: "Approval", body: "After the assessment, the tutor approves your child as a student." },
            { title: "Book lessons", body: "Book 1-to-1 lessons, group sessions or a group pass, whenever suits you." },
          ]}
        />
        <div className="mt-10">
          <ButtonLink href={href} size="lg">
            Book an Assessment Lesson
          </ButtonLink>
        </div>
      </Section>
    </>
  );
}
