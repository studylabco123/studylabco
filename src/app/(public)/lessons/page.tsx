import Link from "next/link";
import { PageIntro, Section } from "@/components/site/PageIntro";
import { PriceTable, type PriceRow } from "@/components/site/PriceTable";
import { Steps } from "@/components/site/Steps";
import { ButtonLink } from "@/components/ui/Button";
import { formatPence } from "@/lib/format";
import { bookHref, loadGroupSeries, publicSettings } from "@/lib/public/data";
import { pageMetadata } from "@/lib/public/meta";
import { blockOffers, groupTimesByDay, lessonPrices } from "@/lib/public/prices";

export const metadata = pageMetadata(
  "Lessons and prices",
  "Prices for the Assessment Lesson, 1-to-1 lessons, weekend group sessions and block bookings, plus when lessons run and how new students get started.",
  "/lessons",
);

const PRODUCT_NAME = { saturday: "Saturday group", sunday_bundle: "Sunday bundle" } as const;

function list(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export default async function LessonsPage() {
  const [settings, href, series] = await Promise.all([publicSettings(), bookHref(), loadGroupSeries()]);
  const p = lessonPrices(settings);
  const home = settings.homeVisitsEnabled;
  const place = settings.tutorPlaceEnabled;
  const areas = list(settings.allowedPostcodeDistricts);
  const groupTimes = groupTimesByDay(series);
  const offers = blockOffers(settings);
  const homeNote = `Sundays only, ${areas} postcodes`;

  const placeLabel = place ? "At the tutor's place" : "Per lesson";
  const rows: PriceRow[] = [
    {
      name: "Assessment Lesson",
      detail: (
        <>
          Every new student&apos;s first lesson. 60 minutes, including a 15-minute talk with you about how it went and what
          comes next. A parent or guardian must be there for the talk.
        </>
      ),
      prices: [
        { label: placeLabel, pence: p.assessment },
        ...(home ? [{ label: "Home visit", pence: p.assessmentHome, note: homeNote }] : []),
      ],
    },
    {
      name: "1-to-1 lesson",
      detail: "60 minutes, one student, planned around their targets, exam board and tier.",
      prices: [
        { label: placeLabel, pence: p.oneToOne },
        ...(home ? [{ label: "Home visit", pence: p.oneToOneHome, note: homeNote }] : []),
      ],
    },
    {
      name: "Group session",
      detail: "60 minutes in a weekend group of up to 15 students. Price per student.",
      prices: [{ label: "Per session", pence: p.group, testId: "price-group" }],
    },
    {
      name: "Sunday bundle",
      detail: "Both Sunday morning group sessions, back to back. Price per student.",
      prices: [{ label: "Per Sunday", pence: p.sundayBundle, testId: "price-sunday-bundle" }],
    },
  ];

  const weekendLine = (day: number, name: string) =>
    groupTimes[day]?.length ? `${name}: group ${groupTimes[day].length > 1 ? "sessions" : "session"} at ${list(groupTimes[day])}` : null;
  const saturday = weekendLine(6, "Saturday");
  const sunday = weekendLine(0, "Sunday");

  return (
    <>
      <PageIntro title="Lessons and prices">
        <p>
          Every lesson lasts 60 minutes. Prices are final (Study Lab Co is not VAT registered) and there are no joining or
          admin fees.
        </p>
      </PageIntro>

      <Section id="prices" title="Prices">
        <PriceTable label="Lesson prices" rows={rows} />
        {home ? (
          <p className="mt-6 max-w-prose text-small text-navy-600">
            Home visits include a {formatPence(p.travel)} travel fee, already added to the prices above. They are available on
            Sundays after the morning groups, for {areas} postcodes only, and are confirmed once the tutor has approved the
            request.
          </p>
        ) : null}
      </Section>

      <Section
        id="blocks"
        title="Block bookings for groups"
        tone="sky"
        intro="Book the Saturday group or the Sunday bundle for 6 or 10 weeks in one go and pay less than booking week by week."
      >
        <ul aria-label="Block booking prices" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {offers.map((o) => (
            <li key={`${o.product}-${o.weeks}`} className="flex flex-col gap-2 rounded-card border border-sky-200 bg-white p-5">
              <h3 className="font-display text-small font-semibold">
                {PRODUCT_NAME[o.product]}, {o.weeks} weeks
              </h3>
              <p className="font-display text-h2 font-semibold tabular-nums">{formatPence(o.pricePence)}</p>
              <p className="text-small text-navy-600">
                {o.savingPence > 0 ? (
                  <>
                    <span className="font-semibold text-success-700">Save {formatPence(o.savingPence)}</span> against{" "}
                    {formatPence(o.weeklyPence)} week by week
                  </>
                ) : (
                  <>Same as booking week by week</>
                )}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-prose text-small text-navy-600">
          A block is held for 72 hours while you pay. If your child misses a week, the usual cancellation rules apply to that
          week. See the <Link href="/refunds" className="font-semibold text-navy-900 underline underline-offset-4">Refund Policy</Link>.
        </p>
      </Section>

      <Section id="times" title="When lessons run" intro="Times change a little through the year. The booking calendar always shows the real free slots, up to four weeks ahead.">
        <dl className="grid gap-6 md:grid-cols-2">
          <div className="border-l-2 border-sky-300 pl-4">
            <dt className="font-display font-semibold">Term time, Monday to Friday</dt>
            <dd className="text-navy-600">Early evening 1-to-1 and Assessment Lessons, after school.</dd>
          </div>
          <div className="border-l-2 border-sky-300 pl-4">
            <dt className="font-display font-semibold">Weekends</dt>
            <dd className="text-navy-600">
              {[saturday, sunday].filter(Boolean).map((l) => (
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
              Book at least {settings.minNoticeHours} hours ahead. Cancel free up to {settings.cancellationNoticeHours} hours before the
              lesson.
            </dd>
          </div>
        </dl>
      </Section>

      <Section id="new-students" title="New students start here" tone="sky">
        <Steps
          label="Steps for new students"
          steps={[
            { title: "Create an account", body: "Sign up as the parent or guardian, add your child and sign the agreement form." },
            {
              title: "Assessment Lesson",
              body: (
                <>
                  A 60-minute Assessment Lesson, including a <strong>15-minute talk with you</strong>.
                </>
              ),
            },
            { title: "Approval", body: "After the assessment, the tutor approves your child as a student." },
            { title: "Book lessons", body: "Book 1-to-1 lessons, group sessions or a block, whenever suits you." },
          ]}
        />
        <div className="mt-10">
          <ButtonLink href={href} size="lg">
            Book your {formatPence(p.assessment)} Assessment Lesson
          </ButtonLink>
        </div>
      </Section>
    </>
  );
}
