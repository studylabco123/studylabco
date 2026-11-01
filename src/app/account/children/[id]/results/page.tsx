import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { formatLondon } from "@/lib/format";
import { KIND_LABEL, scoreLine, type ResultKind } from "@/lib/results/validation";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Results" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(`/account/children/${id}/results`)}`);

  // RLS hides other parents' children (and drafts), so they simply are not found.
  const { data: child } = await supabase.from("children").select("id, first_name").eq("id", id).maybeSingle();
  if (!child) notFound();
  const { data: results } = await supabase
    .from("test_results")
    .select("id, title, kind, taken_on, score, out_of, grade")
    .eq("child_id", id)
    .order("taken_on", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6 px-5 py-12 sm:px-8">
      <div className="flex flex-col gap-2">
        <Link href="/account/children" className="underline underline-offset-4">
          Back to your children
        </Link>
        <h1 className="text-h1">{child.first_name}&rsquo;s results</h1>
      </div>
      {results?.length ? (
        <ul className="flex flex-col gap-4">
          {results.map((r) => (
            <Card as="li" key={r.id} className="flex flex-col gap-1">
              <h2 className="text-h3">
                <Link href={`/account/children/${id}/results/${r.id}`} className="underline underline-offset-4">
                  {r.title}
                </Link>
              </h2>
              <p className="text-small text-navy-600">
                {KIND_LABEL[r.kind as ResultKind]} · {formatLondon(new Date(`${r.taken_on}T12:00:00Z`), "d MMMM yyyy")}
              </p>
              <p>
                {scoreLine(r.score, r.out_of)}
                {r.grade ? ` · grade ${r.grade}` : ""}
              </p>
            </Card>
          ))}
        </ul>
      ) : (
        <p>No results to show yet. We will email you when {child.first_name}&rsquo;s results are ready.</p>
      )}
    </div>
  );
}
