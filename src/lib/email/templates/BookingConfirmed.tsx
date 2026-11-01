import { formatPence } from "@/lib/format";
import { AccountLink, BankBlock, H, Layout, P, paymentReferences, SessionList } from "./parts";
import { DEFAULT_NOTICE_HOURS, type BankDetails, type SessionLine } from "../types";

export interface BookingConfirmedProps {
  parentName: string;
  sessions: SessionLine[];
  totalPence: number;
  bank: BankDetails | null;
  /** Shown only for confirmed tutor_place sessions (never for home visits or groups). */
  teachingAddress: string | null;
  /** Shown only for online sessions. */
  meetingLink: string | null;
  /** The block's SLC reference when the sessions belong to one block. */
  blockReference: string | null;
  noticeHours?: number;
}

export function BookingConfirmed({
  parentName,
  sessions,
  totalPence,
  bank,
  teachingAddress,
  meetingLink,
  blockReference,
  noticeHours = DEFAULT_NOTICE_HOURS,
}: BookingConfirmedProps) {
  const live = sessions.filter((s) => s.status !== "declined" && s.status !== "cancelled" && s.status !== "late_cancelled");
  const pendingHomeVisit = sessions.some((s) => s.status === "pending" && s.location === "home_visit");
  const plural = sessions.length > 1;
  const heading = pendingHomeVisit
    ? "We have your home visit request"
    : plural
      ? "Your bookings are confirmed"
      : "Your booking is confirmed";
  return (
    <Layout preview={heading}>
      <H>{heading}</H>
      <P>{`Hi ${parentName},`}</P>
      <P>
        {pendingHomeVisit
          ? "Thank you for your request. We will check it and email you as soon as we approve the visit. Nothing is due until then."
          : plural
            ? "Thank you. Here are the details of your sessions."
            : "Thank you. Here are the details of your session."}
      </P>
      <SessionList
        sessions={sessions}
        teachingAddress={teachingAddress}
        meetingLink={meetingLink}
        noticeHours={noticeHours}
      />
      <P>{`Total: ${formatPence(totalPence)}`}</P>
      {live.length > 0 && !pendingHomeVisit && (
        <BankBlock bank={bank} references={paymentReferences(live, blockReference)} totalPence={totalPence} />
      )}
      <AccountLink />
    </Layout>
  );
}
