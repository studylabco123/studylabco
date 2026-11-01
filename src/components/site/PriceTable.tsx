import type { ReactNode } from "react";
import { InfoTip } from "@/components/ui/InfoTip";
import { cn } from "@/lib/cn";
import { formatPence } from "@/lib/format";

export type PriceItem = {
  label: string;
  pence: number;
  testId?: string;
  note?: ReactNode;
  /** A short plain-English explanation behind an "i" button beside the price. */
  info?: { label: string; text: ReactNode };
};

export type PriceRow = {
  name: string;
  detail?: ReactNode;
  /** One or more prices for this lesson, e.g. at the tutor's place and as a home visit. */
  prices: PriceItem[];
};

/**
 * A price list, read like the back page of a lab notebook: lesson on the left,
 * prices on the right. Lists rather than a table so it reflows on phones
 * without sideways scrolling. An info button sits beside each price; its
 * explanation opens below that price, inside the fixed-width price column.
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
          <ul aria-label={`${row.name} prices`} className="flex flex-col gap-2 sm:w-64">
            {row.prices.map((p) => (
              <li key={p.label} className="flex flex-wrap items-center gap-x-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-fine text-navy-600">{p.label}</span>
                  {p.note ? <span className="text-fine text-navy-600">{p.note}</span> : null}
                </span>
                <span className="font-display text-h3 font-semibold tabular-nums" data-testid={p.testId}>
                  {formatPence(p.pence)}
                </span>
                {p.info ? <InfoTip label={p.info.label} text={p.info.text} /> : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
