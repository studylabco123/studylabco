import type { Metadata } from "next";
import Link from "next/link";
import { ExpenseForm } from "@/components/admin/money/ExpenseForm";
import { MilesEntry } from "@/components/admin/money/MilesEntry";
import { RefundForm } from "@/components/admin/money/RefundForm";
import { PassList } from "@/components/admin/passes/PassList";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Table, Td, Th } from "@/components/ui/Table";
import { requireAdmin } from "@/lib/admin-guard";
import { loadMoney } from "@/lib/admin/money-queries";
import { loadAdminPasses } from "@/lib/admin/pass-queries";
import { formatLondon, formatPence } from "@/lib/format";
import { categoryLabel } from "@/lib/money/categories";

export const metadata: Metadata = { title: "Money" };
export const dynamic = "force-dynamic";

export default async function AdminMoneyPage() {
  await requireAdmin();
  const [m, passes] = await Promise.all([loadMoney(), loadAdminPasses()]);
  const missing = m.trips.filter((t) => t.miles === null).length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">Money</h1>
        <ButtonLink href="/admin/money/tax" variant="secondary">
          Tax Year Pack
        </ButtonLink>
      </div>

      <section aria-labelledby="income-h" className="flex flex-col gap-3">
        <h2 id="income-h" className="text-h2">
          Income received
        </h2>
        <p className="text-fine text-navy-600">Payments minus refunds, by the date received (London time).</p>
        <dl className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["This week", m.income.week],
              ["This month", m.income.month],
              ["This year", m.income.year],
            ] as const
          ).map(([label, pence]) => (
            <Card key={label} tone="sky" className="p-4 sm:p-5">
              <dt className="font-display text-small font-medium">{label}</dt>
              <dd className="text-h2">{formatPence(pence)}</dd>
            </Card>
          ))}
        </dl>
      </section>

      <section aria-labelledby="owed-h" className="flex flex-col gap-3">
        <h2 id="owed-h" className="text-h2">
          Outstanding: {formatPence(m.outstandingTotalPence)}
        </h2>
        {m.outstanding.length === 0 ? (
          <p>Nobody owes anything right now.</p>
        ) : (
          <Table caption="Unpaid lessons and fees" hideCaption>
            <thead>
              <tr>
                <Th>Family</Th>
                <Th>Child</Th>
                <Th>Lesson</Th>
                <Th className="text-right">Owed</Th>
              </tr>
            </thead>
            <tbody>
              {m.outstanding.map((o) => (
                <tr key={o.bookingId}>
                  <Td>{o.parentId ? <Link className="underline" href={`/admin/families/${o.parentId}`}>{o.parentName}</Link> : o.parentName}</Td>
                  <Td>{o.childName}</Td>
                  <Td>{formatLondon(o.startsAt, "EEE d MMM yyyy")}</Td>
                  <Td className="text-right">{formatPence(o.owedPence)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p>
          <Link className="underline" href="/admin/bookings?filter=unpaid">
            Mark these paid in Bookings
          </Link>
        </p>
      </section>

      <section id="passes" aria-labelledby="passes-h" className="flex flex-col gap-3">
        <h2 id="passes-h" className="text-h2">
          Group passes
        </h2>
        <p className="text-fine text-navy-600">
          A pass can be used once it is marked paid; the payment counts as income on that day. Converting a pass to credit
          turns its unused sessions into account credit (never income).
        </p>
        <PassList items={passes} empty="No group passes awaiting payment or in use." />
      </section>

      <Card as="section" aria-labelledby="exp-h" className="flex flex-col gap-4 p-4 sm:p-6">
        <h2 id="exp-h" className="text-h2">
          Add an expense
        </h2>
        <ExpenseForm today={m.today} />
      </Card>

      <section aria-labelledby="exp-list-h" className="flex flex-col gap-3">
        <h2 id="exp-list-h" className="text-h2">
          Recent expenses
        </h2>
        {m.expenses.length === 0 ? (
          <p>No expenses yet.</p>
        ) : (
          <Table caption="Recent expenses" hideCaption>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Category</Th>
                <Th>Description</Th>
                <Th className="text-right">Amount</Th>
                <Th>Receipt</Th>
              </tr>
            </thead>
            <tbody>
              {m.expenses.map((e) => (
                <tr key={e.id}>
                  <Td>{e.spentOn}</Td>
                  <Td>{categoryLabel(e.category)}</Td>
                  <Td>{e.description}</Td>
                  <Td className="text-right">{formatPence(e.amountPence)}</Td>
                  <Td>
                    {e.receiptUrl ? (
                      <a className="underline" href={e.receiptUrl} target="_blank" rel="noopener noreferrer">
                        View receipt
                      </a>
                    ) : (
                      "None"
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="text-fine text-navy-600">Receipt links stop working after 5 minutes. Reload the page for a fresh one.</p>
      </section>

      <section aria-labelledby="miles-h" className="flex flex-col gap-3">
        <h2 id="miles-h" className="text-h2">
          Mileage
        </h2>
        <p>Home visits add a trip here when approved. Enter the miles driven (there and back). Allowance: 45p a mile for the first 10,000 miles each tax year, then 25p.</p>
        {missing > 0 ? (
          <p role="status" className="font-semibold text-danger-700">
            {missing} {missing === 1 ? "trip has" : "trips have"} no miles entered.
          </p>
        ) : null}
        {m.trips.length === 0 ? (
          <p>No trips yet.</p>
        ) : (
          <Table caption="Trips" hideCaption>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Note</Th>
                <Th>Miles</Th>
              </tr>
            </thead>
            <tbody>
              {m.trips.map((t) => (
                <tr key={t.id}>
                  <Td>{t.tripOn}</Td>
                  <Td>{t.note}</Td>
                  <Td>
                    <MilesEntry id={t.id} miles={t.miles} label={`trip on ${t.tripOn}`} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <Card as="section" aria-labelledby="refund-h" className="flex flex-col gap-4 p-4 sm:p-6">
        <h2 id="refund-h" className="text-h2">
          Record a refund
        </h2>
        <p>Use this after you have sent money back to a family. It is taken off your income for the date of the refund.</p>
        <RefundForm bookings={m.refundable} />
      </Card>
    </div>
  );
}
