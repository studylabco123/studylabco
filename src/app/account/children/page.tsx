import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { childLevelLine } from "@/lib/children/summary";
import { formatLondon } from "@/lib/format";
import { createServerClient } from "@/lib/supabase/server";
import type { Level } from "@/lib/types";

export const metadata: Metadata = { title: "Your children" };

export default async function ChildrenPage() {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=%2Faccount%2Fchildren");
  const { data: children } = await supabase
    .from("children")
    .select("id, first_name, last_name, school_year, level, exam_board, tier, subjects, agreements(signed_at)")
    .order("created_at");

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6 px-5 py-12 sm:px-8">
      <h1 className="text-h1">Your children</h1>
      {children?.length ? (
        <ul className="flex flex-col gap-4">
          {children.map((c) => {
            const signedAt = c.agreements?.[0]?.signed_at;
            return (
              <Card as="li" key={c.id} className="flex flex-col gap-3">
                <h2 className="text-h3">
                  {c.first_name} {c.last_name}
                </h2>
                <p>
                  {childLevelLine({ schoolYear: c.school_year, level: c.level as Level, examBoard: c.exam_board, tier: c.tier })}:{" "}
                  {c.subjects.join(", ")}
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  {signedAt ? (
                    <>
                      <Badge tone="success">Agreement signed</Badge>
                      <Link href={`/account/children/${c.id}/agreement`} className="underline underline-offset-4">
                        View agreement (signed {formatLondon(new Date(signedAt), "d MMMM yyyy")})
                      </Link>
                    </>
                  ) : (
                    <>
                      <Badge tone="warning">Agreement needed</Badge>
                      <ButtonLink href={`/account/children/${c.id}/agreement`} variant="secondary">
                        Sign agreement
                      </ButtonLink>
                    </>
                  )}
                  <Link
                    href={`/account/children/${c.id}/results`}
                    aria-label={`Results for ${c.first_name} ${c.last_name}`}
                    className="underline underline-offset-4"
                  >
                    Results
                  </Link>
                  <Link
                    href={`/account/children/${c.id}/level`}
                    aria-label={`Change level for ${c.first_name} ${c.last_name}`}
                    className="underline underline-offset-4"
                  >
                    Change level
                  </Link>
                </div>
              </Card>
            );
          })}
        </ul>
      ) : (
        <p>You have not added a child yet.</p>
      )}
      <div>
        <ButtonLink href="/account/children/new">Add child</ButtonLink>
      </div>
    </div>
  );
}
