import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatLondon } from "@/lib/format";
import { signedAttachmentUrl } from "@/lib/results/attachment";
import { KIND_LABEL, scoreLine, type ResultKind } from "@/lib/results/validation";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Result" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ResultPage({ params }: { params: Promise<{ id: string; resultId: string }> }) {
  const { id, resultId } = await params;
  if (!UUID.test(id) || !UUID.test(resultId)) notFound();
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(`/account/children/${id}/results/${resultId}`)}`);

  // RLS: only the parent's own child's published results come back.
  const { data: r } = await supabase
    .from("test_results")
    .select("id, title, kind, taken_on, score, out_of, grade, went_well, to_improve, attachment_path, children(first_name)")
    .eq("id", resultId)
    .eq("child_id", id)
    .maybeSingle();
  if (!r) notFound();
  const child = (Array.isArray(r.children) ? r.children[0] : r.children) as { first_name: string } | null;
  // Ownership and published state are checked again before a link is signed.
  const attachment = r.attachment_path ? await signedAttachmentUrl(r.id, auth.user.id) : null;

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6 px-5 py-12 sm:px-8">
      <div className="flex flex-col gap-2">
        <Link href={`/account/children/${id}/results`} className="underline underline-offset-4">
          Back to {child?.first_name}&rsquo;s results
        </Link>
        <h1 className="text-h1">{r.title}</h1>
        <p className="text-lead">
          {KIND_LABEL[r.kind as ResultKind]} · {formatLondon(new Date(`${r.taken_on}T12:00:00Z`), "d MMMM yyyy")}
        </p>
      </div>
      <p className="font-display text-h2">{scoreLine(r.score, r.out_of)}</p>
      {r.grade ? <p>Grade: {r.grade}</p> : null}
      <section aria-labelledby="well" className="flex flex-col gap-2">
        <h2 id="well" className="text-h3">
          What went well
        </h2>
        <p className="max-w-prose whitespace-pre-line">{r.went_well}</p>
      </section>
      <section aria-labelledby="improve" className="flex flex-col gap-2">
        <h2 id="improve" className="text-h3">
          What to improve
        </h2>
        <p className="max-w-prose whitespace-pre-line">{r.to_improve}</p>
      </section>
      {attachment ? (
        <p>
          <a href={attachment} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-4">
            View attachment (opens in a new tab)
          </a>
        </p>
      ) : null}
    </div>
  );
}
