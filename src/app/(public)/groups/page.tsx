import Link from "next/link";
import { GroupList } from "@/components/site/GroupList";
import { PageIntro, Section } from "@/components/site/PageIntro";
import { bookHref, loadGroupSeries, loadUpcomingGroups, publicSettings } from "@/lib/public/data";
import { pageMetadata } from "@/lib/public/meta";
import { passSummary } from "@/lib/public/price-info";
import { groupDaysByLevel, YEAR9_NOTE } from "@/lib/public/prices";

export const metadata = pageMetadata(
  "Group sessions",
  "Upcoming KS3 and GCSE Science group sessions in Blackburn at weekends, with who each is for, the seats left and the price per student.",
  "/groups",
);

export default async function GroupsPage() {
  const [settings, href, groups, series] = await Promise.all([publicSettings(), bookHref(), loadUpcomingGroups(new Date()), loadGroupSeries()]);
  return (
    <>
      <PageIntro title="Group sessions">
        <p>
          Weekend groups of up to {settings.defaultGroupCapacity} students, working through topics and exam-style questions
          together at your child&apos;s level. {groupDaysByLevel(series)} Seat numbers are live: when a session is full, it says
          so.
        </p>
        <p className="mt-3 text-body font-semibold text-navy-900">{YEAR9_NOTE}</p>
      </PageIntro>
      <Section
        id="upcoming"
        title="Upcoming sessions"
        intro={
          <>
            All times are UK time. Groups are for students who have had their Assessment Lesson and been approved; new
            students can <Link href="/lessons#new-students" className="font-semibold text-navy-900 underline underline-offset-4">start here</Link>.
            Coming most weeks? {passSummary(settings)}{" "}
            <Link href="/lessons#passes" className="font-semibold text-navy-900 underline underline-offset-4">
              Group pass prices
            </Link>
            .
          </>
        }
      >
        <GroupList groups={groups} bookHref={href} />
      </Section>
    </>
  );
}
