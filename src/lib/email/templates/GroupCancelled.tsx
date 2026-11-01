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
        {session.fromPass
          ? "You will not be charged, and the session goes back on your group pass so you can book another one with it."
          : credited
          ? "You will not be charged. The payment you made is kept as credit on your account, and the tutor will apply it to a future lesson. If you would rather have a refund, please get in touch."
          : "You will not be charged for this session."}
      </P>
      <AccountLink label="Book another session" />
    </Layout>
  );
}
