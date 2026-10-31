import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loadAccountOverview } from "@/lib/booking/account-data";
import { createServerClient } from "@/lib/supabase/server";
import { BookingList } from "./BookingList";
import { CancelNotice } from "./CancelNotice";

export const metadata: Metadata = { title: "Your bookings" };

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string; fee?: string }>;
}) {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=%2Faccount%2Fbookings");
  const { cancelled, fee } = await searchParams;
  const overview = await loadAccountOverview(auth.user.id);

  return (
    <div className="mx-auto flex max-w-content flex-col gap-8 px-5 py-12 sm:px-8">
      <div className="flex flex-col gap-2">
        <Link href="/account" className="underline underline-offset-4">
          Back to your account
        </Link>
        <h1 className="text-h1">Your bookings</h1>
      </div>
      <CancelNotice cancelled={cancelled} fee={fee} />
      <section aria-labelledby="upcoming" className="flex flex-col gap-4">
        <h2 id="upcoming" className="text-h2">
          Upcoming
        </h2>
        <BookingList items={overview.upcoming} empty="You have no upcoming bookings." />
      </section>
      <section aria-labelledby="past" className="flex flex-col gap-4">
        <h2 id="past" className="text-h2">
          Past and cancelled
        </h2>
        <BookingList items={overview.past} empty="Nothing here yet." />
      </section>
    </div>
  );
}
