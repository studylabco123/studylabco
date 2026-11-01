import { formatPence } from "@/lib/format";
import type { Level } from "@/lib/types";
import { AccountLink, BankBlock, H, Layout, P } from "./parts";
import type { BankDetails } from "../types";

export interface PassPaymentReminderProps {
  parentName: string;
  level: Level;
  sessions: number;
  totalPence: number;
  reference: string;
  bank: BankDetails | null;
}

/** One reminder, 48 hours after buying, while a group pass is still awaiting payment. */
export function PassPaymentReminder({ parentName, level, sessions, totalPence, reference, bank }: PassPaymentReminderProps) {
  return (
    <Layout preview="A reminder to pay for your group pass">
      <H>{`A reminder about your ${level} group pass`}</H>
      <P>{`Hi ${parentName},`}</P>
      <P>
        {`We have not yet received payment for your ${sessions}-session ${level} group pass (${formatPence(totalPence)}). Sessions unlock once we've received your payment.`}
      </P>
      <BankBlock bank={bank} references={[reference]} totalPence={totalPence} />
      <P>If you have already paid, thank you. Please ignore this email.</P>
      <AccountLink label="View your account" />
    </Layout>
  );
}
