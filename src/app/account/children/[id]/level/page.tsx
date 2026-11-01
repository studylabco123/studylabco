import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChildLevelForm } from "@/components/children/ChildLevelForm";
import { childLevelLine } from "@/lib/children/summary";
import { createServerClient } from "@/lib/supabase/server";
import type { Level } from "@/lib/types";

export const metadata: Metadata = { title: "Change level" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ChangeLevelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(`/account/children/${id}/level`)}`);

  // RLS hides other parents' children, so they simply are not found.
  const { data: child } = await supabase
    .from("children")
    .select("id, first_name, last_name, school_year, level, exam_board, tier")
    .eq("id", id)
    .maybeSingle();
  if (!child) notFound();

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6 px-5 py-12 sm:px-8">
      <div className="flex flex-col gap-2">
        <Link href="/account/children" className="underline underline-offset-4">
          Back to your children
        </Link>
        <h1 className="text-h1">Change level</h1>
        <p className="text-lead">
          For {child.first_name} {child.last_name}, now{" "}
          {childLevelLine({
            schoolYear: child.school_year as number,
            level: child.level as Level,
            examBoard: child.exam_board as string | null,
            tier: child.tier as string | null,
          })}
          .
        </p>
      </div>
      <p className="max-w-prose">
        Update the school year, or for Year 9 whether your child is studying KS3 or GCSE. Existing bookings stay as they
        are, at the price you booked. New bookings follow the new level.
      </p>
      <ChildLevelForm
        childId={child.id as string}
        current={{
          school_year: String(child.school_year),
          level: child.level as string,
          exam_board: (child.exam_board as string | null) ?? "",
          tier: (child.tier as string | null) ?? "",
        }}
      />
    </div>
  );
}
