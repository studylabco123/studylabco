import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InfoTip } from "@/components/ui/InfoTip";
import { loadAccountOverview } from "@/lib/booking/account-data";
import { CREDIT_INFO } from "@/lib/booking/info";
import { formatLondon, formatPence } from "@/lib/format";
import { FALLBACK_EMAIL } from "@/lib/site";
import { createServerClient } from "@/lib/supabase/server";
import { BookingList, contactFrom } from "./bookings/BookingList";
import { CancelNotice } from "./bookings/CancelNotice";
import { PassSection } from "./passes/PassSection";
import { signOut } from "./actions";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string; fee?: string; pass?: string }>;
}) {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=%2Faccount");
  const { cancelled, fee, pass } = await searchParams;
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", auth.user.id).single();
  const name = profile?.full_name || auth.user.email;
  const o = await loadAccountOverview(auth.user.id);

  return (
    <div className="mx-auto flex max-w-content flex-col gap-8 px-5 py-12 sm:px-8">
      <h1 className="text-h1">Welcome, {name}</h1>
      <CancelNotice cancelled={cancelled} fee={fee} lateFeePercent={o.lateFeePercent} />

      <div>
        {o.isBlocked ? (
          <p className="text-lead">Please contact Study Lab Co.</p>
        ) : (
          <ButtonLink href="/account/book">Book a lesson</ButtonLink>
        )}
      </div>

      {o.owedPence > 0 ? (
        <Card tone="sky" className="flex flex-col gap-3">
          <h2 className="text-h2">Balance to pay</h2>
          <p>
            You owe <strong data-testid="owed">{formatPence(o.owedPence)}</strong>. Pay by bank transfer or cash, quoting
            the reference for each lesson.
          </p>
          <ul className="flex flex-col gap-1">
            {o.owedLines.map((l) => (
              <li key={l.reference}>
                <span className="font-display font-medium">{l.reference}</span>: {l.title},{" "}
                {formatLondon(l.startsAt, "d MMM yyyy")}, {formatPence(l.amountPence)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {o.creditPence > 0 ? (
        <Card tone="sky" className="flex flex-col gap-2">
          <h2 className="text-h2">Credit</h2>
          <div className="flex flex-wrap items-start gap-1">
            <p data-testid="credit" className="flex-1 pt-2">
              You have <strong>{formatPence(o.creditPence)}</strong> credit — the tutor will apply it to a future lesson.
            </p>
            <InfoTip label="credit" text={CREDIT_INFO} />
          </div>
          <p data-testid="credit-refund" className="text-small">
            Want it refunded to your card instead? Email{" "}
            <a href={`mailto:${FALLBACK_EMAIL}`} className="font-semibold underline">
              {FALLBACK_EMAIL}
            </a>
            .
          </p>
        </Card>
      ) : null}

      <PassSection o={o} justBought={typeof pass === "string" && o.passes.some((v) => v.pass.paymentReference === pass)} />

      <section aria-labelledby="children" className="flex flex-col gap-4">
        <h2 id="children" className="text-h2">
          Your children
        </h2>
        {o.children.length ? (
          <ul className="flex flex-col gap-3">
            {o.children.map((ch) => (
              <Card as="li" key={ch.id} className="flex flex-wrap items-center gap-3">
                <span className="text-h3">{ch.name}</span>
                <span className="text-small text-navy-600">{ch.levelLine}</span>
                {ch.hasAgreement ? (
                  <Badge tone="success">Agreement signed</Badge>
                ) : (
                  <Badge tone="warning">Agreement needed</Badge>
                )}
                {ch.approved ? <Badge tone="success">Approved</Badge> : <Badge tone="warning">Awaiting assessment</Badge>}
              </Card>
            ))}
          </ul>
        ) : (
          <p>You have not added a child yet.</p>
        )}
        <div>
          <ButtonLink href="/account/children" variant="secondary">
            Your children and agreements
          </ButtonLink>
        </div>
      </section>

      <section aria-labelledby="upcoming" className="flex flex-col gap-4">
        <h2 id="upcoming" className="text-h2">
          Upcoming bookings
        </h2>
        <BookingList items={o.upcoming} empty="You have no upcoming bookings." contact={contactFrom(o)} />
        <Link href="/account/bookings" className="underline underline-offset-4">
          All bookings, including past and cancelled
        </Link>
      </section>

      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/account/settings" variant="secondary">
          Account settings
        </ButtonLink>
        <form action={signOut}>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
