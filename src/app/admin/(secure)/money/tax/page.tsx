import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requireAdmin } from "@/lib/admin-guard";
import { loadTaxPack } from "@/lib/admin/money-queries";
import { formatPence } from "@/lib/format";
import { quarterRanges, rangeFor, taxYearFor } from "@/lib/money/tax-year";
import { FOOTER_NOTE } from "@/lib/money/xlsx";
import { londonDateOf } from "@/lib/time";

export const metadata: Metadata = { title: "Tax Year Pack" };
export const dynamic = "force-dynamic";

const yearsAround = (current: string): string[] => {
  const y = Number(current.slice(0, 4));
  return [y, y - 1, y - 2].map((s) => `${s}-${String((s + 1) % 100).padStart(2, "0")}`);
};

export default async function AdminTaxPage({ searchParams }: { searchParams: Promise<{ year?: string; q?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const current = taxYearFor(londonDateOf(new Date())).label;
  const q = sp.q ? Number(sp.q) : null;
  const range = rangeFor(sp.year ?? current, q) ?? rangeFor(current)!;
  const pack = await loadTaxPack(range);
  const s = pack.summary;
  const qs = `year=${range.label}${range.q ? `&q=${range.q}` : ""}`;
  const pill = (active: boolean) => buttonClasses({ variant: active ? "primary" : "secondary" });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link className="underline" href="/admin/money">
          Back to Money
        </Link>
        <h1 className="text-h1">Tax Year Pack</h1>
        <p>Pick a tax year (6 April to 5 April), or one quarter of it, then download the spreadsheet for your records and Self Assessment.</p>
      </div>

      <nav aria-label="Tax year" className="flex flex-col gap-3">
        <ul className="flex flex-wrap gap-2">
          {yearsAround(current).map((y) => (
            <li key={y}>
              <Link href={`/admin/money/tax?year=${y}`} className={pill(range.label === y)} aria-current={range.label === y ? "page" : undefined}>
                {y}
              </Link>
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap gap-2" aria-label="Quarter">
          <li>
            <Link href={`/admin/money/tax?year=${range.label}`} className={pill(range.q === null)} aria-current={range.q === null ? "page" : undefined}>
              Whole year
            </Link>
          </li>
          {quarterRanges(range.label).map((r) => (
            <li key={r.q}>
              <Link href={`/admin/money/tax?year=${range.label}&q=${r.q}`} className={pill(range.q === r.q)} aria-current={range.q === r.q ? "page" : undefined}>
                Q{r.q}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Card as="section" aria-labelledby="sum-h" className="flex flex-col gap-3 p-4 sm:p-6">
        <h2 id="sum-h" className="text-h2">
          {range.label}
          {range.q ? ` quarter ${range.q}` : ""}: {range.start} to {range.end}
        </h2>
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2">
          <dt>Turnover</dt>
          <dd className="text-right">{formatPence(s.turnoverPence)}</dd>
          <dt>Expenses</dt>
          <dd className="text-right">{formatPence(s.expensesPence)}</dd>
          <dt>Mileage allowance</dt>
          <dd className="text-right">{formatPence(s.mileagePence)}</dd>
          <dt className="font-semibold">Allowable expenses</dt>
          <dd className="text-right font-semibold">{formatPence(s.allowableTotalPence)}</dd>
          <dt className="font-semibold">Net profit</dt>
          <dd className="text-right font-semibold">{formatPence(s.profitPence)}</dd>
        </dl>
        <p>
          {s.tradingAllowanceBetter
            ? "Your allowable expenses are under £1,000, so the £1,000 trading allowance may be better for you than claiming them."
            : "Your allowable expenses are over £1,000, so claiming them is likely better than the £1,000 trading allowance."}
        </p>
        {pack.missingMilesCount > 0 ? (
          <p role="alert" className="font-semibold text-danger-700">
            {pack.missingMilesCount} {pack.missingMilesCount === 1 ? "trip has" : "trips have"} no miles entered.{" "}
            <Link className="underline" href="/admin/money">
              Add them in Money
            </Link>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <a className={buttonClasses({ variant: "primary" })} href={`/api/admin/tax-pack?${qs}&format=xlsx`}>
            Download spreadsheet (.xlsx)
          </a>
          <a className={buttonClasses({ variant: "secondary" })} href={`/api/admin/tax-pack?${qs}&format=pdf`}>
            Download summary (.pdf)
          </a>
        </div>
        <p className="text-fine text-navy-600">{FOOTER_NOTE}</p>
      </Card>
    </div>
  );
}
