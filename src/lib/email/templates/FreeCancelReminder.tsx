import { formatLondon } from "@/lib/format";
import { AccountLink, cancellationLine, freeCancelUntil, H, Layout, P, passCancellationLine, SessionList } from "./parts";
import { DEFAULT_NOTICE_HOURS, type SessionLine } from "../types";

export interface ReminderProps {
  parentName: string;
  session: SessionLine;
  teachingAddress: string | null;
  meetingLink: string | null;
  noticeHours?: number;
}

export function FreeCancelReminder({
  parentName,
  session,
  teachingAddress,
  meetingLink,
  noticeHours = DEFAULT_NOTICE_HOURS,
}: ReminderProps) {
  const until = freeCancelUntil(session.startsAt, noticeHours, session.bookedAt);
  return (
    <Layout preview={`Free cancellation ends ${formatLondon(until, "EEEE d MMMM 'at' h:mmaaa")}`}>
      <H>Your lesson is coming up</H>
      <P>{`Hi ${parentName},`}</P>
      <P>Free cancellation ends {formatLondon(until, "EEEE d MMMM 'at' h:mmaaa")}. If your plans have changed, you can cancel from your account until then.</P>
      <SessionList
        sessions={[session]}
        teachingAddress={teachingAddress}
        meetingLink={meetingLink}
        noticeHours={noticeHours}
        showCancellation={false}
      />
      <P muted>
        {session.fromPass
          ? passCancellationLine(session.lateFeePence, noticeHours, session.lateFeePercent)
          : cancellationLine(session.startsAt, session.lateFeePence, noticeHours, session.bookedAt, session.lateFeePercent)}
      </P>
      <AccountLink label="Manage your booking" />
    </Layout>
  );
}
