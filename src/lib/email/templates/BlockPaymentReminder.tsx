import { formatPence } from "@/lib/format";
import { AccountLink, BankBlock, H, Layout, P, whenText } from "./parts";
import type { BankDetails } from "../types";

export interface BlockPaymentReminderProps {
  parentName: string;
  reference: string;
  totalPence: number;
  weeks: number;
  holdExpiresAt: Date | null;
  bank: BankDetails | null;
}

export function BlockPaymentReminder({ parentName, reference, totalPence, weeks, holdExpiresAt, bank }: BlockPaymentReminderProps) {
  return (
    <Layout preview="A reminder to pay for your block booking">
      <H>A reminder about your {weeks}-week block</H>
      <P>{`Hi ${parentName},`}</P>
      <P>
        We are holding your places for the {weeks}-week block ({formatPence(totalPence)}) but have not yet received
        payment.
        {holdExpiresAt ? ` Your places are held until ${whenText(holdExpiresAt)}.` : ""}
      </P>
      <BankBlock bank={bank} references={[reference]} totalPence={totalPence} />
      <P>If you have already paid, thank you. Please ignore this email.</P>
      <AccountLink />
    </Layout>
  );
}
