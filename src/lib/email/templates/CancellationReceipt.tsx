import { formatPence } from "@/lib/format";
import { AccountLink, H, Layout, P, SessionList, whenText } from "./parts";
import type { SessionLine } from "../types";

export interface CancellationReceiptProps {
  parentName: string;
  session: SessionLine;
  /** 'tutor': we cancelled it, so no fee ever applies. */
  outcome: "free" | "late" | "tutor";
  /** The booking had already been paid (a free cancellation credits it). */
  wasPaid: boolean;
  /** Tutor cancellation only: the payment is being refunded rather than credited. */
  refunded?: boolean;
}

export function CancellationReceipt({ parentName, session, outcome, wasPaid, refunded }: CancellationReceiptProps) {
  if (outcome === "tutor") {
    return (
      <Layout preview="We have had to cancel your booking">
        <H>We have had to cancel your booking</H>
        <P>{`Hi ${parentName},`}</P>
        <P>
          We are sorry, but we have had to cancel your booking for {whenText(session.startsAt)}. There is no charge for
          this.
        </P>
        <SessionList sessions={[session]} showCancellation={false} />
        {wasPaid ? (
          <P>
            {refunded
              ? "We will refund the payment you made. If you do not see it within a few days, please get in touch."
              : "The payment you made has been credited to your account, and we will be in touch about it."}
          </P>
        ) : (
          <P>Nothing is due.</P>
        )}
        <P>You are welcome to book another time from your account.</P>
        <AccountLink />
      </Layout>
    );
  }
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
