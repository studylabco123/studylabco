import { formatPence } from "@/lib/format";
import type { Level } from "@/lib/types";
import { AccountLink, BankBlock, H, Layout, P } from "./parts";
import type { BankDetails } from "../types";

export interface PassConfirmedProps {
  parentName: string;
  childName: string | null;
  level: Level;
  sessions: number;
  totalPence: number;
  reference: string;
  bank: BankDetails | null;
  /** How long the pass lasts from the day it is marked paid (Settings). */
  validityMonths: number;
  /** Pass sessions must be booked at least this many days ahead (Settings). */
  passMinNoticeDays: number;
}

/** Sent when a parent buys a group pass: what it is, how to pay, and when it can be used. */
export function PassConfirmed({ parentName, childName, level, sessions, totalPence, reference, bank, validityMonths, passMinNoticeDays }: PassConfirmedProps) {
  return (
    <Layout preview={`Your ${level} group pass: how to pay`}>
      <H>{`Your ${level} group pass`}</H>
      <P>{`Hi ${parentName},`}</P>
      <P>
        {`Thank you for buying a ${sessions}-session ${level} group pass${childName ? ` for ${childName}` : ""} (${formatPence(totalPence)}, reference ${reference}).`}
      </P>
      <P>
        {`Sessions unlock once we've received your payment. The pass then lasts ${validityMonths} months from the day we mark it paid; you book each session from your account at least ${passMinNoticeDays} days before it takes place.`}
      </P>
      <BankBlock bank={bank} references={[reference]} totalPence={totalPence} />
      <P muted>
        If you change your mind within 14 days of buying, cancel the pass from your account: anything you have paid for
        sessions you have not used goes back as account credit.
      </P>
      <AccountLink label="View your account" />
    </Layout>
  );
}
