import { freeCancellationEnds } from "@/lib/booking/cancellation";
import { assessmentLevel } from "@/lib/booking/level";
import { lateFeePence } from "@/lib/booking/fees";
import { quote } from "@/lib/booking/pricing";
import { londonDateOf } from "@/lib/time";
import type { DraftPayload, Selection, SessionOption, WizardData } from "../types";
import { LOCATION_LABEL, londonDay, londonTime, londonWhen, TYPE_LABEL } from "./labels";

export interface Summary {
  childName: string;
  what: string;
  when: string;
  where: string;
  lines: { label: string; pence: number }[];
  totalPence: number;
  /** The late cancellation fee for one lesson/session. */
  feePence: number;
  /** Start of the (first) lesson; the free-cancellation deadline counts back from it. */
  firstStart: Date;
  pendingApproval: boolean;
  payload: DraftPayload;
}

const LOCATION_TBC = "Location confirmed on booking";

/** Builds the review summary and the request payload, or null if something is missing. */
export function summarise(sel: Selection, data: WizardData): Summary | null {
  const child = data.children.find((c) => c.id === sel.childId);
  if (!child || !sel.type) return null;
  const s = data.settings;
  const venue = (session?: SessionOption) => session?.venue ?? s.groupVenue ?? LOCATION_TBC;
  const base = { childName: child.name, pendingApproval: false };

  switch (sel.type) {
    case "assessment":
    case "one_to_one": {
      if (!sel.location || !sel.slot) return null;
      const q = quote({ type: sel.type, level: sel.type === "assessment" ? assessmentLevel(child.schoolYear, child.level) : child.level, location: sel.location }, s);
      const home = sel.location === "home_visit";
      const lines = [{ label: TYPE_LABEL[sel.type], pence: q.basePence }];
      if (q.travelPence) lines.push({ label: "Travel fee", pence: q.travelPence });
      return {
        ...base,
        what: `${TYPE_LABEL[sel.type]} (60 minutes)`,
        when: londonWhen(sel.slot),
        where: home ? `Home visit: ${sel.homeAddress}, ${sel.postcode?.toUpperCase()}` : (LOCATION_LABEL[sel.location] ?? ""),
        lines,
        totalPence: q.totalPence,
        // The late cancellation fee is a share of the lesson price (no travel).
        feePence: lateFeePence(q.basePence, s.lateFeePercent),
        firstStart: new Date(sel.slot),
        pendingApproval: home,
        payload: {
          type: sel.type,
          childId: child.id,
          location: sel.location,
          startsAt: sel.slot,
          ...(home ? { homeAddress: sel.homeAddress, postcode: sel.postcode } : {}),
        },
      };
    }
    case "group": {
      const session = data.sessions.find((x) => x.id === sel.sessionId);
      if (!session) return null;
      // A single seat costs the session's own price (set in admin), not the global group price.
      const price = session.pricePence;
      const q = { totalPence: price };
      return {
        ...base,
        what: `${TYPE_LABEL.group}: ${session.title}`,
        when: `${londonWhen(session.startsAt)}–${londonTime(session.endsAt)}`,
        where: venue(session),
        lines: [{ label: TYPE_LABEL.group, pence: q.totalPence }],
        totalPence: q.totalPence,
        feePence: lateFeePence(q.totalPence, s.lateFeePercent),
        firstStart: new Date(session.startsAt),
        payload: { type: "group", childId: child.id, sessionId: session.id },
      };
    }
    case "sunday_bundle": {
      const pair = data.sessions.filter((x) => x.product === "sunday_bundle" && sameDay(x, sel.bundleDate));
      if (!sel.bundleDate || pair.length !== 2) return null;
      const q = quote({ type: "sunday_bundle" }, s);
      return {
        ...base,
        what: `${TYPE_LABEL.sunday_bundle} (both Sunday group sessions)`,
        when: `${londonDay(pair[0].startsAt)}, ${pair.map((x) => `${londonTime(x.startsAt)}–${londonTime(x.endsAt)}`).join(" and ")}`,
        where: venue(pair[0]),
        lines: [{ label: TYPE_LABEL.sunday_bundle, pence: q.totalPence }],
        totalPence: q.totalPence,
        feePence: lateFeePence(q.perBookingPence[0], s.lateFeePercent),
        firstStart: new Date(pair[0].startsAt),
        payload: { type: "sunday_bundle", childId: child.id, date: sel.bundleDate },
      };
    }
    default:
      // Buying a pass and booking with one have their own review steps.
      return null;
  }
}

function sameDay(x: SessionOption, date?: string): boolean {
  return !!date && londonDateOf(new Date(x.startsAt)) === date;
}

/**
 * The review step's cancellation wording (Ruling R20): the 48-hour rule plus
 * the 14-day cooling-off counted from now (the moment of booking). `deadline`
 * is null when the whole run-up to the (first) lesson is inside the cooling-off.
 */
export function cancellationTerms(
  firstStart: Date,
  noticeHours: number,
  multi: boolean,
  bookedAt: Date,
): { rule: string; deadline: Date | null; coolingOffCovers: string | null } {
  const ends = freeCancellationEnds(firstStart, noticeHours, bookedAt);
  const covered = ends.getTime() >= firstStart.getTime();
  return {
    rule: `You can cancel for free up to ${noticeHours} hours before ${multi ? "each session" : "the lesson"}, and at any time in the first 14 days after booking (your cooling-off period).`,
    deadline: covered ? null : ends,
    coolingOffCovers: covered
      ? `${multi ? "The first session starts" : "The lesson starts"} within your 14-day cooling-off period, so you can cancel it for free at any time before it starts.`
      : null,
  };
}
