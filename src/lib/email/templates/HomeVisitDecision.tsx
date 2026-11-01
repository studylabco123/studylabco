import { formatPence } from "@/lib/format";
import { AccountLink, BankBlock, H, Layout, P, SessionList } from "./parts";
import { DEFAULT_NOTICE_HOURS, type BankDetails, type SessionLine } from "../types";

export interface HomeVisitDecisionProps {
  parentName: string;
  decision: "approved" | "declined";
  session: SessionLine;
  bank: BankDetails | null;
  /** Optional explanation from the tutor when declining. */
  reason?: string | null;
  noticeHours?: number;
}

/** Home visits happen at the family's address, so the teaching address is never included. */
export function HomeVisitDecision({
  parentName,
  decision,
  session,
  bank,
  reason,
  noticeHours = DEFAULT_NOTICE_HOURS,
}: HomeVisitDecisionProps) {
  const approved = decision === "approved";
  return (
    <Layout preview={approved ? "Your home visit is confirmed" : "About your home visit request"}>
      <H>{approved ? "Your home visit is confirmed" : "We could not confirm your home visit"}</H>
      <P>{`Hi ${parentName},`}</P>
      {approved ? (
        <>
          <P>Good news. We have approved your home visit request. We will see you at your address at the time below.</P>
          <SessionList sessions={[{ ...session, status: "confirmed" }]} noticeHours={noticeHours} />
          <BankBlock
            bank={bank}
            references={[session.reference]}
            totalPence={session.pricePence + session.travelPence}
          />
          <P muted>Total: {formatPence(session.pricePence + session.travelPence)}, including travel.</P>
        </>
      ) : (
        <>
          <P>
            Sorry, we are not able to make this home visit work. Nothing is due for this request.
            {reason ? ` ${reason}` : ""}
          </P>
          <P>You are welcome to pick another time or another way to meet from your account.</P>
        </>
      )}
      <AccountLink />
    </Layout>
  );
}
