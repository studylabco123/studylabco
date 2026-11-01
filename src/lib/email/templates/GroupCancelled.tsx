import { AccountLink, H, Layout, P, SessionList, whenText } from "./parts";
import type { SessionLine } from "../types";

export interface GroupCancelledProps {
  parentName: string;
  session: SessionLine;
  /** A payment was made and has been credited to the parent's account. */
  credited: boolean;
  reason?: string | null;
}

/** We cancelled a group session: always free, never a fee. */
export function GroupCancelled({ parentName, session, credited, reason }: GroupCancelledProps) {
  return (
    <Layout preview="Your group session has been cancelled">
      <H>Your group session has been cancelled</H>
      <P>{`Hi ${parentName},`}</P>
      <P>
        We are sorry, but we have had to cancel the session on {whenText(session.startsAt)}.
        {reason ? ` ${reason}` : ""}
      </P>
      <SessionList sessions={[session]} showCancellation={false} />
      <P>
        {credited
          ? "You will not be charged. The payment you made has been credited to your account and we will be in touch about it."
          : "You will not be charged for this session."}
      </P>
      <AccountLink label="Book another session" />
    </Layout>
  );
}
