import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";
import { freeCancellationEnds } from "@/lib/booking/cancellation";
import { formatLondon, formatPence } from "@/lib/format";
import type { LocationKind } from "@/lib/types";
import { businessInbox, siteUrl, SITE_NAME } from "../config";
import { DEFAULT_NOTICE_HOURS, type BankDetails, type SessionLine } from "../types";

const NAVY = "#001A42";
const MUTED = "#3D5275";
const PAPER = "#E8F5FE";

const body = { backgroundColor: PAPER, margin: 0, padding: "24px 0", fontFamily: "Helvetica, Arial, sans-serif" };
const card = { backgroundColor: "#FFFFFF", maxWidth: "560px", margin: "0 auto", padding: "28px", borderRadius: "8px" };
const text = { color: NAVY, fontSize: "16px", lineHeight: "24px", margin: "0 0 14px" };

/** Shared frame: text wordmark, content, footer. Transactional: no unsubscribe link. */
export function Layout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="en-GB">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={card}>
          <Text style={{ ...text, fontSize: "20px", fontWeight: 700, margin: "0 0 20px" }}>{SITE_NAME}</Text>
          {children}
          <Hr style={{ borderColor: "#CFE7FA", margin: "24px 0 12px" }} />
          <Text style={{ ...text, color: MUTED, fontSize: "13px", lineHeight: "20px", margin: 0 }}>
            {SITE_NAME} · <Link href={`mailto:${businessInbox()}`}>{businessInbox()}</Link> ·{" "}
            <Link href={`${siteUrl()}/contact`}>Contact us</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function P({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={muted ? { ...text, color: MUTED } : text}>{children}</Text>;
}

export function H({ children }: { children: ReactNode }) {
  return <Text style={{ ...text, fontSize: "18px", fontWeight: 700, margin: "0 0 10px" }}>{children}</Text>;
}

/** "Monday 3 November 2026 at 6:00pm" in London time. */
export function whenText(d: Date): string {
  return formatLondon(d, "EEEE d MMMM yyyy 'at' h:mmaaa");
}

/** Where a session is held, as one line of text. Never reveals the teaching address unless `teachingAddress` is given. */
export function locationText(
  s: Pick<SessionLine, "location" | "status" | "homeAddress" | "venue">,
  opts: { teachingAddress?: string | null; meetingLink?: string | null } = {},
): string {
  const kind: LocationKind = s.location;
  if (kind === "home_visit") return s.homeAddress ? `Home visit at ${s.homeAddress}` : "Home visit";
  if (kind === "online") return opts.meetingLink ? `Online. Meeting link: ${opts.meetingLink}` : "Online. We will send the meeting link before the lesson";
  if (kind === "group_venue") return s.venue ?? "Location confirmed on booking";
  if (s.status === "confirmed" && opts.teachingAddress) return opts.teachingAddress;
  return "Location confirmed on booking";
}

/** When free cancellation ends: the notice deadline, or later inside the 14-day cooling-off (R20). */
export function freeCancelUntil(startsAt: Date, noticeHours = DEFAULT_NOTICE_HOURS, bookedAt?: Date): Date {
  return bookedAt ? freeCancellationEnds(startsAt, noticeHours, bookedAt) : new Date(startsAt.getTime() - noticeHours * 3600_000);
}

/** "Free cancellation until <London time>. After that a late cancellation fee of £X applies." */
export function cancellationLine(
  startsAt: Date,
  lateFeePence: number,
  noticeHours = DEFAULT_NOTICE_HOURS,
  bookedAt?: Date,
): string {
  const until = freeCancelUntil(startsAt, noticeHours, bookedAt);
  if (until.getTime() >= startsAt.getTime()) {
    return "You're within your 14-day cooling-off period, so you can cancel free of charge at any time before this lesson starts.";
  }
  return `Free cancellation until ${formatLondon(until, "EEEE d MMMM 'at' h:mmaaa")}. After that a late cancellation fee of ${formatPence(lateFeePence)} applies.`;
}

export function SessionList({
  sessions,
  teachingAddress,
  meetingLink,
  noticeHours = DEFAULT_NOTICE_HOURS,
  showCancellation = true,
}: {
  sessions: SessionLine[];
  teachingAddress?: string | null;
  meetingLink?: string | null;
  noticeHours?: number;
  showCancellation?: boolean;
}) {
  return (
    <Section>
      {sessions.map((s) => (
        <Section key={s.reference + s.startsAt.getTime()} style={{ borderLeft: `3px solid #B4D6F4`, paddingLeft: "12px", margin: "0 0 14px" }}>
          <Text style={{ ...text, fontWeight: 700, margin: "0 0 2px" }}>
            {`${s.title}${s.childName ? ` for ${s.childName}` : ""}`}
          </Text>
          <Text style={{ ...text, margin: "0 0 2px" }}>{whenText(s.startsAt)}</Text>
          <Text style={{ ...text, margin: "0 0 2px" }}>{locationText(s, { teachingAddress, meetingLink })}</Text>
          <Text style={{ ...text, color: MUTED, fontSize: "14px", margin: "0 0 2px" }}>
            {`Reference ${s.reference} · ${formatPence(s.pricePence + s.travelPence)}`}
          </Text>
          {showCancellation && (
            <Text style={{ ...text, color: MUTED, fontSize: "14px", margin: 0 }}>
              {s.status === "pending" && s.location === "home_visit"
                ? "You can cancel this request free of charge until we confirm it."
                : cancellationLine(s.startsAt, s.lateFeePence, noticeHours, s.bookedAt)}
            </Text>
          )}
        </Section>
      ))}
    </Section>
  );
}

export function BankBlock({ bank, references, totalPence }: { bank: BankDetails | null; references: string[]; totalPence: number }) {
  const ref = references.join(" and ");
  return (
    <Section style={{ backgroundColor: PAPER, padding: "12px 16px", borderRadius: "6px", margin: "0 0 14px" }}>
      <Text style={{ ...text, fontWeight: 700, margin: "0 0 6px" }}>{`How to pay: ${formatPence(totalPence)}`}</Text>
      {bank ? (
        <>
          <Text style={{ ...text, margin: "0 0 2px" }}>{`Account name: ${bank.accountName}`}</Text>
          <Text style={{ ...text, margin: "0 0 2px" }}>{`Sort code: ${bank.sortCode}`}</Text>
          <Text style={{ ...text, margin: "0 0 6px" }}>{`Account number: ${bank.accountNumber}`}</Text>
        </>
      ) : (
        <Text style={{ ...text, margin: "0 0 6px" }}>We will send our bank details separately.</Text>
      )}
      <Text style={{ ...text, margin: 0 }}>
        {`Please use reference ${ref} when you pay${references.length > 1 ? " (one reference for each session listed)" : ""}.`}
      </Text>
    </Section>
  );
}

export function AccountLink({ label = "View your bookings" }: { label?: string }) {
  return (
    <P>
      <Link href={`${siteUrl()}/account/bookings`} style={{ color: NAVY, fontWeight: 700 }}>
        {label}
      </Link>
    </P>
  );
}

export function paymentReferences(sessions: SessionLine[], blockReference?: string | null): string[] {
  if (blockReference) return [blockReference];
  return [...new Set(sessions.map((s) => s.reference))];
}
