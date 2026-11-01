import { createElement } from "react";
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { TEMPLATES, type TemplateName } from "@/lib/email/registry";
import { BookingConfirmed } from "@/lib/email/templates/BookingConfirmed";
import type { SessionLine } from "@/lib/email/types";

const BANK = { accountName: "Study Lab Co", sortCode: "04-00-04", accountNumber: "12345678" };
const START = new Date("2026-11-10T16:00:00Z");
const line = (over: Partial<SessionLine> = {}): SessionLine => ({
  reference: "SLC-1001",
  title: "1-to-1 lesson",
  childName: "Sam",
  startsAt: START,
  endsAt: new Date(START.getTime() + 3600_000),
  location: "tutor_place",
  status: "confirmed",
  pricePence: 2500,
  lateFeePence: 1250,
  travelPence: 0,
  ...over,
});
const html = (el: React.ReactElement) => render(el);

describe("BookingConfirmed", () => {
  it("includes SLC reference, £ total, bank details and teaching address for tutor_place", async () => {
    const out = await html(
      createElement(BookingConfirmed, {
        parentName: "Pat",
        sessions: [line()],
        totalPence: 2500,
        bank: BANK,
        teachingAddress: "1 Teaching Road, Blackburn",
        meetingLink: null,
      }),
    );
    expect(out).toContain("SLC-1001");
    expect(out).toContain("£25");
    expect(out).toContain("12345678");
    expect(out).toContain("04-00-04");
    expect(out).toContain("Study Lab Co");
    expect(out).toContain("1 Teaching Road, Blackburn");
    expect(out).toContain("use reference SLC-1001");
    // 10 Nov 2026 16:00 UTC is 4pm GMT; cancellation deadline is 48h earlier.
    expect(out).toContain("Free cancellation until Sunday 8 November at 4:00pm (or any time in the first 14 days after booking). After that, cancel by phone or email; a late cancellation fee of £12.50 (50%) applies.");
    expect(out).not.toMatch(/online/i);
  });

  it("never includes teaching address for group bookings", async () => {
    const out = await html(
      createElement(BookingConfirmed, {
        parentName: "Pat",
        sessions: [line({ title: "Saturday group", location: "group_venue", venue: null })],
        totalPence: 1800,
        bank: BANK,
        teachingAddress: "1 Teaching Road, Blackburn",
        meetingLink: "https://meet.example/abc",
      }),
    );
    expect(out).not.toContain("1 Teaching Road");
    expect(out).not.toContain("meet.example");
    expect(out).toContain("Location confirmed on booking");
  });

  it("never shows the teaching address or bank details for a pending home visit", async () => {
    const out = await html(
      createElement(BookingConfirmed, {
        parentName: "Pat",
        sessions: [line({ location: "home_visit", status: "pending", homeAddress: "9 Home Street", travelPence: 500 })],
        totalPence: 3000,
        bank: BANK,
        teachingAddress: "1 Teaching Road, Blackburn",
        meetingLink: null,
      }),
    );
    expect(out).not.toContain("1 Teaching Road");
    expect(out).toContain("9 Home Street");
    expect(out).toContain("approve");
  });

  it("omits bank details for declined or cancelled bookings and shows the meeting link only for online", async () => {
    const declined = await html(
      createElement(BookingConfirmed, {
        parentName: "Pat",
        sessions: [line({ status: "declined" })],
        totalPence: 2500,
        bank: BANK,
        teachingAddress: null,
        meetingLink: null,
      }),
    );
    expect(declined).not.toContain("12345678");
    const online = await html(
      createElement(BookingConfirmed, {
        parentName: "Pat",
        sessions: [line({ location: "online" })],
        totalPence: 2500,
        bank: BANK,
        teachingAddress: "1 Teaching Road",
        meetingLink: "https://meet.example/abc",
      }),
    );
    expect(online).toContain("https://meet.example/abc");
    expect(online).not.toContain("1 Teaching Road");
  });
});

const sample: { [K in TemplateName]: Parameters<(typeof TEMPLATES)[K]["component"]>[0] } = {
  booking_confirmed: {
    parentName: "Pat",
    sessions: [line()],
    totalPence: 2500,
    bank: BANK,
    teachingAddress: "1 Teaching Road",
    meetingLink: null,
  },
  home_visit_decision: {
    parentName: "Pat",
    decision: "approved",
    session: line({ location: "home_visit", homeAddress: "9 Home Street", travelPence: 500 }),
    bank: BANK,
  },
  free_cancel_reminder: { parentName: "Pat", session: line(), teachingAddress: "1 Teaching Road", meetingLink: null },
  lesson_reminder: { parentName: "Pat", session: line(), teachingAddress: "1 Teaching Road", meetingLink: null },
  cancellation_receipt: { parentName: "Pat", session: line(), outcome: "late", wasPaid: false },
  group_cancelled: { parentName: "Pat", session: line({ title: "Saturday group", location: "group_venue" }), credited: true },
  group_message: { parentName: "Pat", subject: "Venue change", message: "We are in the main hall.\nSee you there." },
  pass_confirmed: {
    parentName: "Pat",
    childName: "Sam",
    level: "KS3",
    sessions: 6,
    totalPence: 7900,
    reference: "SLC-1003",
    bank: BANK,
    validityMonths: 6,
    passMinNoticeDays: 7,
  },
  pass_payment_reminder: { parentName: "Pat", level: "KS3", sessions: 6, totalPence: 7900, reference: "SLC-1003", bank: BANK },
  results_published: { parentName: "Pat", childName: "Sam", link: "https://example.test/account/children/abc/results" },
  contact_message: { name: "Lee", email: "lee@example.test", phone: null, message: "Hello there" },
  admin_new_booking: { title: "New booking", lines: ["Pat booked a lesson"] },
  admin_home_visit_request: { title: "Home visit request - needs approval", lines: ["x"] },
  admin_late_cancellation: { title: "Late cancellation", lines: ["x"] },
  admin_new_signup: { title: "New sign-up", lines: ["x"] },
  admin_pass_cancelled: { title: "Group pass cancelled", lines: ["x"] },
  admin_pass_credit_failed: { title: "Pass credit not saved", lines: ["x"] },
  admin_new_pass: { title: "New group pass — awaiting payment", lines: ["x"] },
};

describe("cancellation line and the 14-day cooling-off (R20)", () => {
  it("a lesson inside the cooling-off is free to cancel until it starts", async () => {
    const out = await html(
      createElement(BookingConfirmed, {
        parentName: "Pat",
        sessions: [line({ bookedAt: new Date(START.getTime() - 3 * 86_400_000) })],
        totalPence: 2500,
        bank: BANK,
        teachingAddress: null,
        meetingLink: null,
      }),
    );
    expect(out).toContain("cooling-off period, so you can cancel free of charge at any time before this lesson starts");
    expect(out).not.toContain("Free cancellation until");
  });
  it("the reminder subject uses the end of the cooling-off when that is later", () => {
    const bookedAt = new Date(START.getTime() - 15 * 86_400_000); // cooling-off ends 1 day before
    const subject = TEMPLATES.free_cancel_reminder.subject({
      parentName: "Pat",
      session: line({ bookedAt }),
      teachingAddress: null,
      meetingLink: null,
    });
    expect(subject).toBe("Free cancellation ends Mon 9 Nov at 4:00pm");
  });
});

describe("email copy shows the 50% fee amount", () => {
  it("the late cancellation receipt shows the fee, the percentage and any credit kept", async () => {
    const def = TEMPLATES.cancellation_receipt;
    const unpaid = await html(def.component({ parentName: "Pat", session: line({ lateFeePercent: 50 }), outcome: "late", wasPaid: false }));
    expect(unpaid).toContain("a late cancellation fee of £12.50");
    expect(unpaid).toContain("50%");
    expect(unpaid).toContain("SLC-1001");
    const paid = await html(def.component({ parentName: "Pat", session: line(), outcome: "late", wasPaid: true, creditPence: 1250 }));
    expect(paid).toContain("£12.50, is kept as credit");
    expect(paid).not.toMatch(/\bfine\b|penalt|waiver/i);
  });
  it("the session cancellation line uses the Settings percentage", async () => {
    const out = await html(
      createElement(BookingConfirmed, {
        parentName: "Pat",
        sessions: [line({ lateFeePence: 1000, lateFeePercent: 40 })],
        totalPence: 2500,
        bank: BANK,
        teachingAddress: null,
        meetingLink: null,
      }),
    );
    expect(out).toContain("a late cancellation fee of £10 (40%) applies");
  });
});

describe("group passes", () => {
  it("PassConfirmed gives the reference, total, bank details, when sessions unlock and the 6-month validity", async () => {
    const def = TEMPLATES.pass_confirmed;
    const out = await render(def.component(sample.pass_confirmed), { plainText: true });
    expect(out).toContain("SLC-1003");
    expect(out).toContain("£79");
    expect(out).toContain("04-00-04");
    expect(out).toContain("Sessions unlock once we've received your payment");
    expect(out).toContain("6 months from the day we mark it paid");
    expect(out).toContain("within 14 days of buying");
    expect(out).toContain("at least 7 days before it takes place");
    expect(out).not.toContain("at least a week");
    const three = await render(def.component({ ...sample.pass_confirmed, passMinNoticeDays: 3 }), { plainText: true });
    expect(three).toContain("at least 3 days before it takes place");
    expect(def.subject(sample.pass_confirmed)).toBe("Your KS3 group pass (SLC-1003): how to pay");
  });

  it("a session booked with a pass asks for no payment and says the session goes back on the pass", async () => {
    const out = await render(
      createElement(BookingConfirmed, {
        parentName: "Pat",
        sessions: [line({ fromPass: true, title: "Saturday KS3 Science Group", location: "group_venue", pricePence: 1316, lateFeePence: 658 })],
        totalPence: 1316,
        bank: BANK,
        teachingAddress: null,
        meetingLink: null,
        pass: { name: "KS3 group pass", remaining: 5, total: 6 },
      }),
      { plainText: true },
    );
    expect(out).toContain("Booked with your KS3 group pass: nothing more to pay. 5 of 6 sessions left on the pass.");
    expect(out).not.toContain("How to pay");
    expect(out).toContain("the session goes back on your pass");
    expect(out).toContain("£6.58 (50% of one pass session)");
  });
});

describe("ContactMessage", () => {
  it("keeps the sender's line breaks", async () => {
    const def = TEMPLATES.contact_message;
    const out = await html(def.component({ name: "Lee", email: "lee@example.test", phone: "07123 456789", message: "Line one\nLine two" }));
    expect(out).toContain("white-space:pre-wrap");
    expect(out).toContain("Line one\nLine two");
    expect(out).toContain("07123 456789");
  });
});

describe("all templates", () => {
  const names = Object.keys(TEMPLATES) as TemplateName[];

  it("covers every registered template", () => {
    expect(Object.keys(sample).sort()).toEqual([...names].sort());
  });

  it('no template contains "fine" or "penalty"', async () => {
    for (const name of names) {
      const def = TEMPLATES[name] as { component: (p: never) => React.ReactElement };
      const out = await html(def.component(sample[name] as never));
      expect(out, name).not.toMatch(/\bfine\b|penalt/i);
    }
  });

  it("transactional templates have no unsubscribe link, and every footer has the business details", async () => {
    for (const name of names) {
      const def = TEMPLATES[name] as { component: (p: never) => React.ReactElement };
      const out = await html(def.component(sample[name] as never));
      expect(out, name).not.toMatch(/unsubscribe/i);
      expect(out, name).toContain("Study Lab Co");
      expect(out, name).toContain("/contact");
      expect(out, name).toContain("studylabco123@gmail.com");
    }
  });

  it("never mentions online lessons for in-person bookings", async () => {
    for (const name of names) {
      const def = TEMPLATES[name] as { component: (p: never) => React.ReactElement };
      const out = await html(def.component(sample[name] as never));
      expect(out, name).not.toMatch(/online/i);
    }
  });
});
