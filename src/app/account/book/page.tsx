import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureGroupSessions, loadFamily, loadGroupSessions, sessionBookable } from "@/lib/booking/data";
import { IneligibleMessage } from "@/lib/booking/eligibility";
import { getSettings } from "@/lib/settings";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { addDays, londonDateOf } from "@/lib/time";
import type { GroupProduct, Level, LocationKind, Settings } from "@/lib/types";
import { BookingWizard } from "./BookingWizard";
import type { ChildOption, SessionOption, WizardData, WizardSettings } from "./types";

export const metadata: Metadata = { title: "Book a lesson" };

function wizardSettings(s: Settings): WizardSettings {
  const lessonLocations: LocationKind[] = [];
  if (s.tutorPlaceEnabled) lessonLocations.push("tutor_place");
  if (s.homeVisitsEnabled) lessonLocations.push("home_visit");
  if (s.onlineEnabled) lessonLocations.push("online");
  return {
    priceAssessmentPence: s.priceAssessmentPence,
    priceOneToOnePence: s.priceOneToOnePence,
    priceGroupPence: s.priceGroupPence,
    priceKs3AssessmentPence: s.priceKs3AssessmentPence,
    priceKs3OneToOnePence: s.priceKs3OneToOnePence,
    priceKs3GroupPence: s.priceKs3GroupPence,
    lateFeePercent: s.lateFeePercent,
    passPrices: s.passPrices,
    priceSundayBundlePence: s.priceSundayBundlePence,
    travelFeePence: s.travelFeePence,
    blockPrices: s.blockPrices,
    cancellationNoticeHours: s.cancellationNoticeHours,
    homeVisitBufferMinutes: s.homeVisitBufferMinutes,
    allowedPostcodeDistricts: s.allowedPostcodeDistricts,
    groupVenue: s.groupVenue,
    lessonLocations,
  };
}

/** Bookable group sessions in the window, tagged with their series product. */
async function groupSessions(settings: Settings, now: Date): Promise<SessionOption[]> {
  const today = londonDateOf(now);
  // Sessions are generated lazily; make sure the next 12 weeks exist.
  await ensureGroupSessions(addDays(today, 84));
  const to = new Date(now.getTime() + (settings.bookingWindowDays + 1) * 86400_000).toISOString();
  const { sessions, seatsLeft } = await loadGroupSessions(now.toISOString(), to);
  const { data: series } = await createServiceClient().from("group_series").select("id, product");
  const productOf = new Map((series ?? []).map((s) => [s.id as string, s.product as GroupProduct | null]));
  return sessions
    .filter((s) => sessionBookable(s, settings, now))
    .map((s) => ({
      id: s.id,
      title: s.title,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      seatsLeft: seatsLeft[s.id] ?? 0,
      pricePence: s.pricePence,
      venue: s.venue,
      product: s.seriesId ? (productOf.get(s.seriesId) ?? null) : null,
    }));
}

export default async function BookPage() {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=%2Faccount%2Fbook");
  const parentId = auth.user.id;
  const now = new Date();

  // RLS: only this parent's children.
  const { data: rows } = await supabase.from("children").select("id, first_name, last_name, school_year, level").order("created_at");
  const settings = await getSettings();
  const families = await Promise.all((rows ?? []).map((c) => loadFamily(parentId, c.id as string, now)));

  const children: ChildOption[] = [];
  let familyMessage: string | null = null;
  (rows ?? []).forEach((c, i) => {
    const f = families[i];
    if (!f) return;
    if (f.isBlocked) familyMessage = IneligibleMessage.account_blocked;
    else if (f.owedPence > 0) familyMessage ??= IneligibleMessage.money_owed;
    children.push({
      id: c.id as string,
      name: `${c.first_name} ${c.last_name}`,
      level: c.level as Level,
      schoolYear: c.school_year as number,
      hasAgreement: f.hasAgreement,
      approved: f.approved,
      assessmentBooked: f.assessmentBooked,
    });
  });

  const data: WizardData = {
    children,
    settings: wizardSettings(settings),
    familyMessage,
    sessions: children.some((c) => c.approved) ? await groupSessions(settings, now) : [],
  };

  return (
    <div className="mx-auto flex max-w-content flex-col gap-8 px-5 py-12 sm:px-8">
      <div className="flex flex-col gap-2">
        <Link href="/account" className="underline underline-offset-4">
          Back to your account
        </Link>
        <h1 className="text-h1">Book a lesson</h1>
      </div>
      {children.length === 0 ? (
        <p>
          Please{" "}
          <Link href="/account/children/new" className="underline underline-offset-4">
            add your child
          </Link>{" "}
          before booking.
        </p>
      ) : (
        <BookingWizard data={data} />
      )}
    </div>
  );
}
