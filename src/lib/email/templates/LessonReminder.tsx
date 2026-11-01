import { AccountLink, H, Layout, P, SessionList } from "./parts";
import { DEFAULT_NOTICE_HOURS } from "../types";
import type { ReminderProps } from "./FreeCancelReminder";

export function LessonReminder({
  parentName,
  session,
  teachingAddress,
  meetingLink,
  noticeHours = DEFAULT_NOTICE_HOURS,
}: ReminderProps) {
  return (
    <Layout preview="A reminder of your lesson">
      <H>See you soon</H>
      <P>{`Hi ${parentName},`}</P>
      <P>A quick reminder of your lesson.</P>
      <SessionList
        sessions={[session]}
        teachingAddress={teachingAddress}
        meetingLink={meetingLink}
        noticeHours={noticeHours}
        showCancellation={false}
      />
      <AccountLink label="View your bookings" />
    </Layout>
  );
}
