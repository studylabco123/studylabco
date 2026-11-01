import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { requireAdmin } from "@/lib/admin-guard";
import { loadFamilies } from "@/lib/admin/queries";
import { formatPence } from "@/lib/format";

export const metadata: Metadata = { title: "Families" };
export const dynamic = "force-dynamic";

export default async function AdminFamiliesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const q = ((await searchParams).q ?? "").slice(0, 80);
  const families = await loadFamilies(q);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">Families</h1>
      <form action="/admin/families" method="get" role="search" aria-label="Search families" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="q" className="font-display text-small font-medium">
            Search by parent, child, email or phone
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            className="block w-full rounded-field border-2 border-navy-400 bg-white px-3.5 py-2.5 text-body text-navy-900"
          />
        </div>
        <button type="submit" className="min-h-11 rounded-full bg-navy-900 px-5 font-display text-small font-medium text-white">
          Search
        </button>
      </form>
      {families.length ? (
        <ul className="flex flex-col gap-3">
          {families.map((f) => (
            <Card as="li" key={f.id} className="flex flex-col gap-2 p-4 sm:p-5">
              <Link href={`/admin/families/${f.id}`} className="inline-flex min-h-11 items-center font-display text-h3 underline underline-offset-4">
                {f.name}
              </Link>
              <p className="text-navy-600">
                {f.childNames.length ? f.childNames.join(", ") : "No children added"} · {f.phone ?? "no phone"}
              </p>
              <div className="flex flex-wrap gap-2">
                {f.owedPence > 0 ? <Badge tone="warning">Owes {formatPence(f.owedPence)}</Badge> : null}
                {f.flagged ? <Badge tone="danger">Flagged</Badge> : null}
                {f.blocked ? <Badge tone="danger">Blocked</Badge> : null}
              </div>
            </Card>
          ))}
        </ul>
      ) : (
        <p>No families found.</p>
      )}
    </div>
  );
}
