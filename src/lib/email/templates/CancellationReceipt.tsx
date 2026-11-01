import { formatPence } from "@/lib/format";
import { AccountLink, H, Layout, P, SessionList, whenText } from "./parts";
import type { SessionLine } from "../types";

export interface CancellationReceiptProps {
  parentName: string;
  session: SessionLine;
  outcome: "free" | "late";
  /** The booking had already been paid (a free cancellation credits it). */
  wasPaid: boolean;
}

export function CancellationReceipt({ parentName, session, outcome, wasPaid }: CancellationReceiptProps) {
  return (
    <Layout preview="Your cancellation">
      <H>Your booking is cancelled</H>
      <P>{`Hi ${parentName},`}</P>
      <P>We have cancelled your booking for {whenText(session.startsAt)}.</P>
      <SessionList sessions={[session]} showCancellation={false} />
      {outcome === "free" ? (
        <P>
          This was a free cancellation, so nothing is due.
          {wasPaid ? " The payment you made has been credited to your account and we will be in touch about it." : ""}
        </P>
      ) : (
        <P>
          As this was inside the notice period, a late cancellation fee of {formatPence(session.pricePence)} applies.
          Please pay it using reference {session.reference}. Bank details are in your original booking email and on
          your account.
        </P>
      )}
      <AccountLink />
    </Layout>
  );
}
