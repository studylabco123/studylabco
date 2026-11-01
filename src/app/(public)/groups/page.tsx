import Link from "next/link";
import { GroupList } from "@/components/site/GroupList";
import { PageIntro, Section } from "@/components/site/PageIntro";
import { bookHref, loadUpcomingGroups, publicSettings } from "@/lib/public/data";
import { pageMetadata } from "@/lib/public/meta";

export const metadata = pageMetadata(
  "Group sessions",
  "Upcoming GCSE Science group sessions in Blackburn on Saturday and Sunday mornings, with the seats left in each and the price per student.",
  "/groups",
);

export default async function GroupsPage() {
  const [settings, href, groups] = await Promise.all([publicSettings(), bookHref(), loadUpcomingGroups(new Date())]);
  return (
    <>
      <PageIntro title="Group sessions">
        <p>
          Weekend groups of up to {settings.defaultGroupCapacity} students, working through GCSE topics and exam questions
          together. Seat numbers are live: when a session is full, it says so.
        </p>
      </PageIntro>
      <Section
        id="upcoming"
        title="Upcoming sessions"
        intro={
          <>
            All times are UK time. Groups are for students who have had their Assessment Lesson and been approved; new
            students can <Link href="/lessons#new-students" className="font-semibold text-navy-900 underline underline-offset-4">start here</Link>.
          </>
        }
      >
        <GroupList groups={groups} bookHref={href} />
      </Section>
    </>
  );
}
