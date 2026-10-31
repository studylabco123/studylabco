import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AgreementForm } from "@/components/children/AgreementForm";
import { Card } from "@/components/ui/Card";
import { agreementSections, AGREEMENT_TEXT } from "@/lib/agreement";
import { formatLondon } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: AGREEMENT_TEXT.title };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(`/account/children/${id}/agreement`)}`);

  // RLS hides other parents' children, so they simply are not found.
  const { data: child } = await supabase.from("children").select("id, first_name, last_name").eq("id", id).maybeSingle();
  if (!child) notFound();
  const { data: agreement } = await supabase.from("agreements").select("*").eq("child_id", id).maybeSingle();
  const settings = await getSettings();
  const childName = `${child.first_name} ${child.last_name}`;

  return (
    <div className="mx-auto flex max-w-content flex-col gap-8 px-5 py-12 sm:px-8">
      <div className="flex flex-col gap-2">
        <Link href="/account/children" className="underline underline-offset-4">
          Back to your children
        </Link>
        <h1 className="text-h1">{AGREEMENT_TEXT.title}</h1>
        <p className="text-lead">For {childName}</p>
      </div>
      <p>{AGREEMENT_TEXT.intro}</p>
      {agreementSections(settings.onlineEnabled).map((s) => (
        <section key={s.id} className="flex max-w-prose flex-col gap-2">
          <h2 className="text-h3">{s.heading}</h2>
          {s.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}
      {agreement ? (
        <Card tone="sky" as="section" aria-labelledby="signed-heading" className="flex max-w-xl flex-col gap-2">
          <h2 id="signed-heading" className="text-h3">
            Signed on {formatLondon(new Date(agreement.signed_at), "d MMMM yyyy")}
          </h2>
          <p>Signed by {agreement.signed_name}.</p>
          <dl className="flex flex-col gap-1">
            <div>
              <dt className="font-semibold">Emergency contact</dt>
              <dd>
                {agreement.emergency_contact_name}, {agreement.emergency_contact_phone}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Medical information</dt>
              <dd>{agreement.medical_info ?? "None given"}</dd>
            </div>
            <div>
              <dt className="font-semibold">Special educational needs</dt>
              <dd>{agreement.sen_info ?? "None given"}</dd>
            </div>
          </dl>
        </Card>
      ) : (
        <section aria-labelledby="sign-heading" className="flex flex-col gap-4">
          <h2 id="sign-heading" className="text-h3">
            Sign the agreement
          </h2>
          <AgreementForm childId={id} childName={child.first_name} />
        </section>
      )}
    </div>
  );
}
