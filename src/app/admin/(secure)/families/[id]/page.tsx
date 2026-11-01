import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApproveStudentButton, BlockToggle, ManualBookingForm, NoteForm, PayFromCreditButton, RecordLateCancellationButton } from "@/components/admin/FamilyControls";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requireAdmin } from "@/lib/admin-guard";
import { KIND_LABEL, LOCATION_LABEL, PAYMENT_LABEL, statusLabel } from "@/lib/admin/labels";
import { mailtoHref, telHref, whatsappHref } from "@/lib/admin/phone";
import { loadFamily, type FamilyChild } from "@/lib/admin/queries";
import { seatDuePence, willBeOwed } from "@/lib/booking/payment-view";
import { childLevelLine } from "@/lib/children/summary";
import { formatLondon, formatPence } from "@/lib/format";

export const metadata: Metadata = { title: "Family" };
export const dynamic = "force-dynamic";

function childStatus(c: FamilyChild): { text: string; tone: "success" | "warning" | "neutral" } {
  if (c.approvedAt) return { text: "Approved", tone: "success" };
  if (!c.agreement) return { text: "No agreement yet", tone: "neutral" };
  return { text: c.assessmentAttended ? "Assessment attended" : "Awaiting assessment", tone: "warning" };
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-small font-semibold text-navy-600">{label}</dt>
      <dd className="whitespace-pre-line">{children}</dd>
    </div>
  );
}

export default async function AdminFamilyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const f = await loadFamily(id);
  if (!f) notFound();

  const tel = telHref(f.phone);
  const wa = whatsappHref(f.phone);
  const mail = mailtoHref(f.email);
  const link = buttonClasses({ variant: "secondary" });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link href="/admin/families" className="inline-flex min-h-11 items-center underline underline-offset-4">
          All families
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h1">{f.name}</h1>
          {f.flagged ? <Badge tone="danger">Flagged</Badge> : null}
          {f.isBlocked ? <Badge tone="danger">Blocked</Badge> : null}
        </div>
        <p className="text-navy-600">
          {f.email} · {f.phone ?? "no phone"} · joined {formatLondon(f.createdAt, "d MMM yyyy")}
        </p>
        <div className="flex flex-wrap gap-2">
          {tel ? (
            <a href={tel} className={link}>
              Call {f.phone}
            </a>
          ) : null}
          {wa ? (
            <a href={wa} className={link} target="_blank" rel="noopener noreferrer">
              WhatsApp {f.phone}
            </a>
          ) : null}
          {mail ? (
            <a href={mail} className={link}>
              Email {f.email}
            </a>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="summary-h" className="grid gap-4 sm:grid-cols-3">
        <h2 id="summary-h" className="sr-only">
          Money and flags
        </h2>
        <Card tone="sky" className="p-4 sm:p-5">
          <p className="text-small font-semibold text-navy-600">Owed now</p>
          <p className="font-display text-h2" data-testid="owed">
            {formatPence(f.owedPence)}
          </p>
        </Card>
        <Card tone="sky" className="p-4 sm:p-5">
          <p className="text-small font-semibold text-navy-600">Credit</p>
          <p className="font-display text-h2" data-testid="credit">
            {formatPence(f.creditPence)}
          </p>
          <p className="text-small text-navy-600">From paid lessons cancelled for free. Use it with &ldquo;Pay from credit&rdquo;.</p>
        </Card>
        <Card tone="sky" className="p-4 sm:p-5">
          <p className="text-small font-semibold text-navy-600">Late cancellations and no-shows, last 12 months</p>
          <p className="font-display text-h2" data-testid="flag-count">
            {f.flagCount}
          </p>
          <p className="text-small text-navy-600">Flagged at {f.settings.flagThreshold} or more.</p>
        </Card>
      </section>

      <section aria-labelledby="block-h" className="flex flex-col gap-3">
        <h2 id="block-h" className="text-h2">
          Booking access
        </h2>
        <BlockToggle parentId={f.id} blocked={f.isBlocked} reason={f.blockedReason} />
      </section>

      <section aria-labelledby="children-h" className="flex flex-col gap-4">
        <h2 id="children-h" className="text-h2">
          Children
        </h2>
        {f.children.length ? (
          f.children.map((c) => {
            const status = childStatus(c);
            const a = c.agreement;
            const emergencyTel = a ? telHref(a.emergencyContactPhone) : null;
            return (
              <Card as="section" key={c.id} aria-labelledby={`child-${c.id}`} className="flex flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 id={`child-${c.id}`} className="font-display text-h3">
                    {c.name}
                  </h3>
                  <Badge tone={status.tone}>{status.text}</Badge>
                </div>
                <p>
                  <span data-testid="child-level">{childLevelLine(c)}</span>: {c.subjects.join(", ")}
                  {c.targetGrade ? ` · target grade ${c.targetGrade}` : ""}
                </p>

                {a ? (
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <Detail label="Emergency contact">
                      {a.emergencyContactName},{" "}
                      {emergencyTel ? (
                        <a href={emergencyTel} className="underline underline-offset-4">
                          {a.emergencyContactPhone}
                        </a>
                      ) : (
                        a.emergencyContactPhone
                      )}
                    </Detail>
                    <Detail label="Agreement signed">
                      {a.signedName}, {formatLondon(a.signedAt, "d MMM yyyy")} (policy {a.policyVersion})
                    </Detail>
                    <Detail label="Medical information">{a.medicalInfo || "None given"}</Detail>
                    <Detail label="Special educational needs">{a.senInfo || "None given"}</Detail>
                    <Detail label="May we contact the emergency contact?">{a.consentContact ? "Yes" : "No"}</Detail>
                  </dl>
                ) : (
                  <p>The parent has not signed the agreement yet.</p>
                )}

                {!c.approvedAt ? <ApproveStudentButton childId={c.id} name={c.firstName} /> : null}

                <div className="flex flex-col gap-3">
                  <h4 className="font-display font-semibold">Notes</h4>
                  {c.notes.length ? (
                    <ul className="flex flex-col gap-2">
                      {c.notes.map((n) => (
                        <li key={n.id} className="rounded-field bg-sky-50 p-3">
                          <p className="whitespace-pre-line">{n.body}</p>
                          <p className="text-fine text-navy-600">{formatLondon(n.createdAt, "d MMM yyyy, h:mmaaa")}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-navy-600">No notes yet.</p>
                  )}
                  <NoteForm childId={c.id} name={c.firstName} />
                </div>

                <details className="rounded-field border border-sky-200 p-3">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center font-display font-semibold">
                    Add a booking by hand for {c.firstName}
                  </summary>
                  <div className="pt-3">
                    <ManualBookingForm parentId={f.id} childId={c.id} name={c.firstName} />
                  </div>
                </details>
              </Card>
            );
          })
        ) : (
          <p>No children added yet.</p>
        )}
      </section>

      <section aria-labelledby="history-h" className="flex flex-col gap-4">
        <h2 id="history-h" className="text-h2">
          History
        </h2>
        {f.history.length ? (
          <ul aria-label="Booking history" className="flex flex-col gap-2">
            {f.history.map((i) => {
              const b = i.booking;
              const status = statusLabel(b.status, b.location);
              const pay = PAYMENT_LABEL[b.paymentStatus];
              return (
                <li key={b.id} className="flex flex-col gap-1 rounded-field border border-sky-200 bg-white p-3">
                  <p>
                    <strong>{formatLondon(b.startsAt, "EEE d MMM yyyy, h:mmaaa")}</strong> · {i.childName} · {KIND_LABEL[b.kind]} ·{" "}
                    {LOCATION_LABEL[b.location]}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={status.tone}>{status.text}</Badge>
                    <Badge tone={pay.tone}>{pay.text}</Badge>
                    <span className="text-small text-navy-600">
                      {formatPence(seatDuePence(b, f.settings.lateFeePercent))}
                    </span>
                    {f.creditPence > 0 && willBeOwed(b) ? (
                      <PayFromCreditButton
                        bookingId={b.id}
                        label={`${b.blockBookingId ? "Pay block from credit" : "Pay from credit"} for ${b.paymentReference}`}
                      />
                    ) : null}
                    {b.status === "pending" || b.status === "confirmed" ? (
                      <RecordLateCancellationButton bookingId={b.id} label={`Record late cancellation for ${b.paymentReference}`} />
                    ) : null}
                    <Link
                      href={`/admin/bookings?filter=all&q=${b.paymentReference}`}
                      className="inline-flex min-h-11 items-center text-small underline underline-offset-4"
                    >
                      Manage {b.paymentReference}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>No bookings yet.</p>
        )}
      </section>
    </div>
  );
}
