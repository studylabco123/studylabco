import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatPence } from "@/lib/format";

export type PriceRow = {
  name: string;
  detail?: ReactNode;
  /** One or more prices for this lesson, e.g. at the tutor's place and as a home visit. */
  prices: { label: string; pence: number; testId?: string; note?: string }[];
};

/**
 * A price list, read like the back page of a lab notebook: lesson on the left,
 * prices on the right. A description list rather than a table so it reflows
 * on phones without sideways scrolling.
 */
export function PriceTable({ rows, label, className }: { rows: PriceRow[]; label: string; className?: string }) {
  return (
    <ul aria-label={label} className={cn("divide-y divide-sky-200 rounded-card border border-sky-200 bg-white", className)}>
      {rows.map((row) => (
        <li key={row.name} className="grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-8 sm:p-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-h3">{row.name}</h3>
            {row.detail ? <div className="max-w-prose text-small text-navy-600">{row.detail}</div> : null}
          </div>
          <dl className="flex flex-wrap gap-x-8 gap-y-2 sm:justify-end">
            {row.prices.map((p) => (
              <div key={p.label} className="flex flex-col sm:items-end">
                <dt className="text-fine text-navy-600">{p.label}</dt>
                <dd className="font-display text-h3 font-semibold tabular-nums" data-testid={p.testId}>
                  {formatPence(p.pence)}
                </dd>
                {p.note ? <dd className="text-fine text-navy-600">{p.note}</dd> : null}
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}
