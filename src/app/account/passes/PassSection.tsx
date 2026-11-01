import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InfoTip } from "@/components/ui/InfoTip";
import type { AccountOverview } from "@/lib/booking/account-data";
import { passInfo } from "@/lib/booking/info";
import { formatPence } from "@/lib/format";
import { CancelPass } from "./CancelPass";

/** The dashboard's group passes: what is left, how to pay one awaiting payment, and "Book a session". */
export function PassSection({ o, justBought }: { o: AccountOverview; justBought: boolean }) {
  if (!o.passes.length) return null;
  const tipSettings = { passValidityMonths: o.passValidityMonths, passMinNoticeDays: o.passMinNoticeDays };
  return (
    <section id="passes" aria-labelledby="passes-h" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-1">
        <h2 id="passes-h" className="text-h2 flex-1 pt-1">
          Group passes
        </h2>
        <InfoTip label="group passes" text={passInfo(o.passes[0].pass.level, tipSettings)} />
      </div>
      {justBought ? (
        <p role="status" className="max-w-prose rounded-field bg-sky-100 px-4 py-3">
          Thank you, your pass is set up. Pay by bank transfer using the reference below, and you can book sessions as soon
          as the payment arrives. We have emailed you the details too.
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {o.passes.map((v) => (
          <Card as="li" key={v.pass.id} tone={v.pass.status === "awaiting_payment" ? "sky" : undefined} className="flex flex-col gap-3">
            <p className="text-h3">{v.text}</p>
            {v.childName ? <p className="text-small text-navy-600">For {v.childName}</p> : null}
            {v.pass.status === "awaiting_payment" ? (
              <div className="flex flex-col gap-2">
                <p>
                  Pay <strong>{formatPence(v.pass.pricePence)}</strong> by bank transfer using reference{" "}
                  <strong data-testid="pass-reference">{v.pass.paymentReference}</strong>. Sessions unlock once we&apos;ve
                  received your payment, and the pass lasts {o.passValidityMonths} months from then.
                </p>
                {o.bank ? (
                  <dl aria-label="Bank details" className="grid gap-1 sm:grid-cols-[10rem_1fr]">
                    <dt className="font-display font-medium">Account name</dt>
                    <dd>{o.bank.accountName}</dd>
                    <dt className="font-display font-medium">Sort code</dt>
                    <dd>{o.bank.sortCode}</dd>
                    <dt className="font-display font-medium">Account number</dt>
                    <dd>{o.bank.accountNumber}</dd>
                  </dl>
                ) : (
                  <p>We will email you our bank details.</p>
                )}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              {v.bookable ? <ButtonLink href={`/account/book?pass=${v.pass.id}`}>Book a session</ButtonLink> : null}
              {v.cancellable ? (
                <CancelPass passId={v.pass.id} paid={v.pass.status === "active"} label={`${v.pass.level} group pass ${v.pass.paymentReference}`} />
              ) : null}
            </div>
            {v.cancellable && v.pass.status === "active" ? (
              <p className="text-small text-navy-600">
                If you change your mind within 14 days of buying, unused sessions go back as credit.
              </p>
            ) : null}
          </Card>
        ))}
      </ul>
    </section>
  );
}
