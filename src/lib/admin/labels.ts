import type { BadgeTone } from "@/components/ui/Badge";
import type { BookingKind, BookingStatus, LocationKind, PaymentStatus } from "@/lib/types";

export const KIND_LABEL: Record<BookingKind, string> = {
  assessment: "Assessment",
  one_to_one: "1-to-1",
  group: "Group",
};

export const LOCATION_LABEL: Record<LocationKind, string> = {
  tutor_place: "Tutor's place",
  home_visit: "Home visit",
  online: "Online",
  group_venue: "Group venue",
};

export function statusLabel(status: BookingStatus, location: LocationKind): { text: string; tone: BadgeTone } {
  switch (status) {
    case "pending":
      return { text: location === "home_visit" ? "Needs approval" : "Pending", tone: "warning" };
    case "confirmed":
      return { text: "Confirmed", tone: "success" };
    case "attended":
      return { text: "Attended", tone: "success" };
    case "declined":
      return { text: "Declined", tone: "neutral" };
    case "cancelled":
      return { text: "Cancelled", tone: "neutral" };
    case "late_cancelled":
      return { text: "Late cancelled", tone: "danger" };
    case "no_show":
      return { text: "No-show", tone: "danger" };
  }
}

export const PAYMENT_LABEL: Record<PaymentStatus, { text: string; tone: BadgeTone }> = {
  unpaid: { text: "Unpaid", tone: "warning" },
  paid: { text: "Paid", tone: "success" },
  waived: { text: "Waived", tone: "neutral" },
  credited: { text: "Credited", tone: "neutral" },
  refunded: { text: "Refunded", tone: "neutral" },
};
