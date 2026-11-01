import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { AdminPassItem } from "@/lib/admin/pass-queries";
import { passCardText } from "@/lib/booking/pass";
import { formatLondon, formatPence } from "@/lib/format";
import type { PassStatus } from "@/lib/types";
import { PassActions } from "./PassActions";

const STATUS: Record<PassStatus, { text: string; tone: BadgeTone }> = {
  awaiting_payment: { text: "Awaiting payment", tone: "warning" },
  active: { text: "Active", tone: "success" },
  expired: { text: "Expired", tone: "neutral" },
  cancelled: { text: "Cancelled", tone: "neutral" },
};

/** Group passes with their actions (Money page and family page). Server component. */
export function PassList({ items, showFamily = true, empty }: { items: AdminPassItem[]; showFamily?: boolean; empty: string }) {
  if (!items.length) return <p>{empty}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {items.map(({ pass, parentName, childName, remaining }) => (
        <Card as="li" key={pass.id} data-pass-id={pass.id} className="flex flex-col gap-2 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-h3">{childName}</h3>
            {showFamily && pass.parentId ? (
              <Link href={`/admin/families/${pass.parentId}`} className="inline-flex min-h-11 items-center underline underline-offset-4">
                {parentName}
              </Link>
            ) : null}
            <Badge tone={STATUS[pass.status].tone}>{STATUS[pass.status].text}</Badge>
          </div>
          <p>{passCardText(pass, remaining)}</p>
          <p className="text-small text-navy-600">
            {formatPence(pass.pricePence)} · Reference {pass.paymentReference} · bought {formatLondon(pass.createdAt, "d MMM yyyy")}
            {pass.paidAt ? ` · paid ${formatLondon(pass.paidAt, "d MMM yyyy")}` : ""}
          </p>
          {pass.status !== "cancelled" ? <PassActions passId={pass.id} reference={pass.paymentReference} status={pass.status} /> : null}
        </Card>
      ))}
    </ul>
  );
}
