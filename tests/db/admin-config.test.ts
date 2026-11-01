import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BACKUP_TABLES, backupFilename, buildBackup } from "@/lib/admin/backup";
import { blockRange, blockRepeating, closeDay, reopenDay, unblock } from "@/lib/admin/calendar-ops";
import { cancelSession, createOneOff, createSeries, emailGroup, endSeries, updateSeries, updateSession, type SeriesInput } from "@/lib/admin/group-ops";
import { regenerateFeedToken, saveSettings } from "@/lib/admin/settings-ops";
import { settingsToFormInput } from "@/lib/admin/settings-validation";
import { loadFeedEntries } from "@/lib/calendar/feed";
import { testOutbox } from "@/lib/email/send";
import { getPrivateSettings, getSettings } from "@/lib/settings";
import { londonDateOf, londonDateTime } from "@/lib/time";
import { closeDb, createChild, createUser, db, resetData } from "./setup";

const H = 3600_000;
const DAY = 24 * H;
let stdout: { mockRestore(): void; mock: { calls: unknown[][] } };

const rows = async <T,>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows as T[];
const dayBlocks = (date: string) =>
  rows<{ reason: string; is_default: boolean }>(
    `select reason, is_default from blocked_times
      where starts_at = ($1::date::timestamp at time zone 'Europe/London')
        and ends_at = (($1::date + 1)::timestamp at time zone 'Europe/London')`,
    [date],
  );

async function cleanup() {
  await resetData();
  await db.query("delete from group_series where title like 'TEST%'");
}
beforeEach(async () => {
  await cleanup();
  stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true) as unknown as typeof stdout;
  testOutbox.length = 0;
});
afterEach(() => stdout.mockRestore());
afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe("closeDay / reopenDay", () => {
  test("closeDay blocks London midnight to the next London midnight, and is idempotent", async () => {
    expect(await closeDay("2027-03-30")).toEqual({ ok: true }); // BST day: 23h-long UTC offsets differ at both ends
    expect(await closeDay("2027-03-30")).toEqual({ ok: true });
    const r = await rows<{ starts_at: Date; ends_at: Date; reason: string; is_default: boolean }>(
      "select starts_at, ends_at, reason, is_default from blocked_times where reason = 'Closed'",
    );
    expect(r).toHaveLength(1);
    expect(r[0].starts_at.toISOString()).toBe("2027-03-29T23:00:00.000Z");
    expect(r[0].ends_at.toISOString()).toBe("2027-03-30T23:00:00.000Z");
    expect(r[0].is_default).toBe(false);
  });

  test("a closed day is spanned by one block that ensure_group_sessions respects", async () => {
    await closeDay("2027-03-27"); // a Saturday
    await db.query("select ensure_group_sessions('2027-03-28')");
    const day = await rows("select 1 from group_sessions where starts_at >= '2027-03-27T00:00Z' and starts_at < '2027-03-28T00:00Z'");
    expect(day).toHaveLength(0);
  });

  test("reopenDay deletes the whole-day blocks, default ones too, and only that date", async () => {
    await closeDay("2027-03-30");
    await closeDay("2027-03-31");
    expect(await reopenDay("2027-03-30")).toEqual({ ok: true });
    expect(await dayBlocks("2027-03-30")).toHaveLength(0);
    expect(await dayBlocks("2027-03-31")).toHaveLength(1);

    // Christmas Day is a seeded default: reopening removes it.
    expect(await dayBlocks("2026-12-25")).toHaveLength(1);
    expect(await reopenDay("2026-12-25")).toEqual({ ok: true });
    expect(await dayBlocks("2026-12-25")).toHaveLength(0);
    await db.query(
      `insert into blocked_times (starts_at, ends_at, reason, is_default)
       values ('2026-12-25'::date::timestamp at time zone 'Europe/London', '2026-12-26'::date::timestamp at time zone 'Europe/London', 'Christmas Day', true)`,
    );
  });

  test("reopening a day that is not closed, or only covered by a longer block, explains why", async () => {
    expect(await reopenDay("2027-04-01")).toMatchObject({ ok: false, message: "This day is not closed." });
    await blockRange("2027-04-05T00:00", "2027-04-08T00:00", "Holiday");
    expect(await reopenDay("2027-04-06")).toMatchObject({ ok: false, message: expect.stringContaining("longer block") });
  });

  test("rejects impossible dates", async () => {
    expect(await closeDay("2027-02-31")).toMatchObject({ ok: false });
    expect(await closeDay("tomorrow")).toMatchObject({ ok: false });
    expect(await reopenDay("")).toMatchObject({ ok: false });
  });
});

describe("blocks", () => {
  test("blockRange stores London wall-clock times as instants and validates", async () => {
    expect(await blockRange("2027-07-05T14:00", "2027-07-05T16:30", "Dentist")).toEqual({ ok: true });
    const r = await rows<{ starts_at: Date; ends_at: Date; reason: string }>("select starts_at, ends_at, reason from blocked_times where reason = 'Dentist'");
    expect(r[0].starts_at.toISOString()).toBe("2027-07-05T13:00:00.000Z");
    expect(r[0].ends_at.toISOString()).toBe("2027-07-05T15:30:00.000Z");
    expect(await blockRange("2027-07-05T16:00", "2027-07-05T15:00", "")).toMatchObject({ ok: false });
    expect(await blockRange("nonsense", "2027-07-05T15:00", "")).toMatchObject({ ok: false });
    expect(await blockRange("2027-07-05T10:00", "2027-07-05T11:00", "x".repeat(201))).toMatchObject({ ok: false });
  });

  test("blockRepeating inserts a weekly rule and validates", async () => {
    expect(await blockRepeating(3, "17:00", "18:00", "2027-01-06", "", "Choir")).toEqual({ ok: true });
    expect(await blockRepeating(2, "17:00", "18:00", "2027-01-05", "2027-03-01", "Club")).toEqual({ ok: true });
    const r = await rows<{ weekday: number; start_time: string; valid_to: string | null; reason: string }>(
      "select weekday, start_time::text, valid_to::text, reason from blocked_rules order by weekday",
    );
    expect(r).toEqual([
      { weekday: 2, start_time: "17:00:00", valid_to: "2027-03-01", reason: "Club" },
      { weekday: 3, start_time: "17:00:00", valid_to: null, reason: "Choir" },
    ]);
    expect(await blockRepeating(7, "17:00", "18:00", "2027-01-05", "", "")).toMatchObject({ ok: false });
    expect(await blockRepeating(1, "18:00", "17:00", "2027-01-05", "", "")).toMatchObject({ ok: false });
    expect(await blockRepeating(1, "17:00", "18:00", "2027-01-05", "2027-01-01", "")).toMatchObject({ ok: false });
    expect(await blockRepeating(1, "25:00", "26:00", "2027-01-05", "", "")).toMatchObject({ ok: false });
  });

  test("unblock removes either kind and says so when missing", async () => {
    await blockRange("2027-07-05T14:00", "2027-07-05T15:00", "One");
    await blockRepeating(1, "17:00", "18:00", "2027-01-05", "", "Two");
    const one = (await rows<{ id: string }>("select id from blocked_times where reason = 'One'"))[0].id;
    const two = (await rows<{ id: string }>("select id from blocked_rules where reason = 'Two'"))[0].id;
    expect(await unblock(one)).toEqual({ ok: true });
    expect(await unblock(two)).toEqual({ ok: true });
    expect(await unblock(two)).toMatchObject({ ok: false });
    expect(await unblock("not-a-uuid")).toMatchObject({ ok: false });
  });
});

function series(over: Partial<SeriesInput> = {}): SeriesInput {
  return {
    title: "TEST Wednesday Group",
    weekday: 3,
    startTime: "17:30",
    capacity: 15,
    price: "18",
    venue: "",
    isOnline: false,
    yearGroup: "Year 11",
    product: "",
    startsOn: londonDateOf(new Date(Date.now() + 1 * DAY)).replace(/.*/, (d) => {
      // The next Wednesday on or after tomorrow.
      let t = new Date(`${d}T12:00:00Z`);
      while (t.getUTCDay() !== 3) t = new Date(t.getTime() + DAY);
      return t.toISOString().slice(0, 10);
    }),
    ...over,
  };
}

async function sessionsOf(title: string) {
  return rows<{ id: string; capacity: number; price_pence: number; venue: string | null; status: string; title: string; starts_at: Date }>(
    "select id, capacity, price_pence, venue, status, title, starts_at from group_sessions where title like $1 order by starts_at",
    [`${title}%`],
  );
}

describe("group series", () => {
  test("createSeries generates 12 weeks of sessions from the start date", async () => {
    const input = series();
    expect(await createSeries(input)).toEqual({ ok: true });
    const s = await sessionsOf("TEST Wednesday Group");
    expect(s.length).toBeGreaterThanOrEqual(11);
    expect(s.length).toBeLessThanOrEqual(13);
    expect(s[0].capacity).toBe(15);
    expect(s[0].price_pence).toBe(1800);
    expect(londonDateOf(s[0].starts_at)).toBe(input.startsOn);
  });

  test("createSeries validates", async () => {
    expect(await createSeries(series({ title: " " }))).toMatchObject({ ok: false });
    expect(await createSeries(series({ capacity: 0 }))).toMatchObject({ ok: false });
    expect(await createSeries(series({ price: "abc" }))).toMatchObject({ ok: false });
    expect(await createSeries(series({ weekday: 4 }))).toMatchObject({ ok: false }); // start date is a Wednesday
    expect(await createSeries(series({ startTime: "9am" }))).toMatchObject({ ok: false });
    expect(await sessionsOf("TEST")).toHaveLength(0);
  });

  test("createOneOff makes one session with no series", async () => {
    const date = londonDateOf(new Date(Date.now() + 10 * DAY));
    expect(await createOneOff({ title: "TEST Workshop", date, startTime: "10:00", durationMinutes: 90, capacity: 8, price: "12.50", venue: "Hall", isOnline: false })).toEqual({ ok: true });
    const r = await rows<{ series_id: string | null; starts_at: Date; ends_at: Date; price_pence: number }>(
      "select series_id, starts_at, ends_at, price_pence from group_sessions where title = 'TEST Workshop'",
    );
    expect(r).toHaveLength(1);
    expect(r[0].series_id).toBeNull();
    expect(r[0].price_pence).toBe(1250);
    expect(r[0].starts_at.getTime()).toBe(londonDateTime(date, "10:00").getTime());
    expect(r[0].ends_at.getTime() - r[0].starts_at.getTime()).toBe(90 * 60_000);
  });

  async function book(sessionId: string, n: number, over: { payment?: string; status?: string } = {}) {
    const out: { parent: string; booking: string }[] = [];
    for (let i = 0; i < n; i++) {
      const p = await createUser({ fullName: `Fam${i} Parent` });
      const c = await createChild(p.id, { firstName: `Kid${i}` });
      const { rows: b } = await db.query<{ id: string }>(
        `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until, group_session_id, status, price_pence, payment_status)
         select $1, $2, 'group', 'group_venue', starts_at, ends_at, ends_at, id, $4::booking_status, price_pence, $5::payment_status
           from group_sessions where id = $3 returning id`,
        [p.id, c, sessionId, over.status ?? "confirmed", over.payment ?? "unpaid"],
      );
      out.push({ parent: p.id, booking: b[0].id });
    }
    return out;
  }

  test("updateSeries carries changes to future sessions and refuses seats below bookings", async () => {
    await createSeries(series());
    const [first, second] = await sessionsOf("TEST Wednesday Group");
    await book(second.id, 4);

    const tooSmall = await updateSeries((await rows<{ id: string }>("select id from group_series where title = 'TEST Wednesday Group'"))[0].id, {
      title: "TEST Wednesday Group", capacity: 3, price: "18", venue: "", isOnline: false,
    });
    expect(tooSmall).toMatchObject({ ok: false, message: expect.stringContaining("4 seats") });
    expect((await sessionsOf("TEST Wednesday Group"))[0].capacity).toBe(15);

    const seriesId = (await rows<{ id: string }>("select id from group_series where title = 'TEST Wednesday Group'"))[0].id;
    expect(await updateSeries(seriesId, { title: "TEST Wednesday Group", capacity: 4, price: "20", venue: "Main hall", isOnline: false })).toEqual({ ok: true });
    const after = await sessionsOf("TEST Wednesday Group");
    expect(after.every((s) => s.capacity === 4 && s.price_pence === 2000 && s.venue === "Main hall")).toBe(true);
    expect(after[0].id).toBe(first.id);
    // Existing bookings keep their price.
    expect((await rows<{ price_pence: number }>("select price_pence from bookings"))[0].price_pence).toBe(1800);
    expect(await updateSeries("00000000-0000-0000-0000-000000000000", { title: "x", capacity: 4, price: "1", venue: "", isOnline: false })).toMatchObject({ ok: false });
  });

  test("updateSession edits one scheduled session only", async () => {
    await createSeries(series());
    const [a, b] = await sessionsOf("TEST Wednesday Group");
    await book(a.id, 2);
    expect(await updateSession(a.id, { title: "TEST Special", capacity: 1, price: "5", venue: "", isOnline: false })).toMatchObject({ ok: false });
    expect(await updateSession(a.id, { title: "TEST Special", capacity: 10, price: "5", venue: "Annex", isOnline: false })).toEqual({ ok: true });
    const s = await sessionsOf("TEST");
    expect(s.find((x) => x.id === a.id)).toMatchObject({ title: "TEST Special", capacity: 10, price_pence: 500, venue: "Annex" });
    expect(s.find((x) => x.id === b.id)).toMatchObject({ capacity: 15 });
  });

  test("cancelSession cancels seats, refunds paid ones on request, emails each family", async () => {
    await createSeries(series());
    const [a] = await sessionsOf("TEST Wednesday Group");
    const [paid, unpaid] = [...(await book(a.id, 1, { payment: "paid" })), ...(await book(a.id, 1, { payment: "unpaid" }))];

    expect(await cancelSession(a.id, true)).toEqual({ ok: true });
    const b = await rows<{ id: string; status: string; payment_status: string; cancelled_by: string }>("select id, status, payment_status, cancelled_by from bookings");
    expect(b.find((x) => x.id === paid.booking)).toMatchObject({ status: "cancelled", payment_status: "refunded", cancelled_by: "tutor" });
    expect(b.find((x) => x.id === unpaid.booking)).toMatchObject({ status: "cancelled", payment_status: "unpaid" });
    const ledger = await rows<{ kind: string; amount_pence: number; occurred_on: string; booking_id: string }>(
      "select kind::text, amount_pence, to_char(occurred_on,'YYYY-MM-DD') as occurred_on, booking_id from ledger",
    );
    expect(ledger).toEqual([{ kind: "refund", amount_pence: 1800, occurred_on: londonDateOf(new Date()), booking_id: paid.booking }]);
    expect((await sessionsOf("TEST Wednesday Group"))[0].status).toBe("cancelled");
    const mails = await rows<{ template: string }>("select template from email_log where template = 'group_cancelled'");
    expect(mails).toHaveLength(2);
    // Seats are free again.
    const left = await rows<{ n: number }>("select seats_left($1) as n", [a.id]);
    expect(left[0].n).toBe(15);
    // A second cancel is refused, nothing doubles.
    expect(await cancelSession(a.id, true)).toMatchObject({ ok: false });
    expect(await rows("select 1 from ledger")).toHaveLength(1);
  });

  test("cancelSession emails a family once even with two children on the session", async () => {
    await createSeries(series());
    const [a] = await sessionsOf("TEST Wednesday Group");
    const p = await createUser({ fullName: "Twin Parent" });
    for (const name of ["Kid1", "Kid2"]) {
      const c = await createChild(p.id, { firstName: name });
      await db.query(
        `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until, group_session_id, status, price_pence)
         select $1, $2, 'group', 'group_venue', starts_at, ends_at, ends_at, id, 'confirmed', price_pence from group_sessions where id = $3`,
        [p.id, c, a.id],
      );
    }
    expect(await cancelSession(a.id, true)).toEqual({ ok: true });
    expect((await rows("select 1 from bookings where status = 'cancelled'"))).toHaveLength(2);
    expect(await rows("select 1 from email_log where template = 'group_cancelled'")).toHaveLength(1);
  });

  test("cancelSession can credit instead of refund", async () => {
    await createSeries(series());
    const [a] = await sessionsOf("TEST Wednesday Group");
    const [paid] = await book(a.id, 1, { payment: "paid" });
    expect(await cancelSession(a.id, false)).toEqual({ ok: true });
    expect((await rows<{ payment_status: string }>("select payment_status::text from bookings where id = $1", [paid.booking]))[0].payment_status).toBe("credited");
    expect((await rows<{ kind: string }>("select kind::text from ledger"))[0].kind).toBe("credit");
  });

  test("an email failure does not undo the cancellation", async () => {
    await createSeries(series());
    const [a] = await sessionsOf("TEST Wednesday Group");
    await book(a.id, 1);
    stdout.mockRestore();
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => {
      throw new Error("transport down");
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await cancelSession(a.id, true);
    spy.mockRestore();
    err.mockRestore();
    expect(res).toEqual({ ok: true });
    expect((await rows<{ status: string }>("select status from bookings"))[0].status).toBe("cancelled");
  });

  test("endSeries deactivates, removes unbooked future sessions and keeps booked ones", async () => {
    await createSeries(series());
    const all = await sessionsOf("TEST Wednesday Group");
    await book(all[1].id, 2);
    const seriesId = (await rows<{ id: string }>("select id from group_series where title = 'TEST Wednesday Group'"))[0].id;
    const res = await endSeries(seriesId);
    expect(res).toEqual({ ok: true, removed: all.length - 1, kept: 1 });
    expect((await rows<{ active: boolean }>("select active from group_series where id = $1", [seriesId]))[0].active).toBe(false);
    const left = await sessionsOf("TEST Wednesday Group");
    expect(left.map((s) => s.id)).toEqual([all[1].id]);
    // Generation no longer recreates them.
    await db.query("select ensure_group_sessions(current_date + 120)");
    expect(await sessionsOf("TEST Wednesday Group")).toHaveLength(1);
  });

  test("emailGroup mails each booked family once, strips CR/LF and caps the subject", async () => {
    await createSeries(series());
    const [a] = await sessionsOf("TEST Wednesday Group");
    const seats = await book(a.id, 2);
    await book(a.id, 1, { status: "cancelled" });
    const res = await emailGroup(a.id, `Venue change\r\nBcc: evil@example.test ${"x".repeat(200)}`, "We are in the hall.\nSee you there.");
    expect(res).toEqual({ ok: true, sent: 2 });
    const lines = testOutbox.filter((e) => e.template === "group_message");
    expect(lines).toHaveLength(2);
    for (const l of lines) {
      expect(l.subject).not.toMatch(/[\r\n]/);
      expect(l.subject.length).toBe(120);
      expect(l.subject.startsWith("Venue change Bcc: evil@example.test")).toBe(true);
    }
    expect(seats).toHaveLength(2);
    // A second message to the same session is not swallowed by the idempotency key.
    expect(await emailGroup(a.id, "Second", "Another note")).toEqual({ ok: true, sent: 2 });
  });

  test("emailGroup validates the message and the audience", async () => {
    await createSeries(series());
    const [a] = await sessionsOf("TEST Wednesday Group");
    expect(await emailGroup(a.id, "Hi", "x")).toMatchObject({ ok: false, message: "Nobody is booked on this session yet." });
    expect(await emailGroup(a.id, "", "x")).toMatchObject({ ok: false });
    expect(await emailGroup(a.id, "Hi", "")).toMatchObject({ ok: false });
    expect(await emailGroup(a.id, "Hi", "x".repeat(2001))).toMatchObject({ ok: false });
    expect(await emailGroup("nope", "Hi", "x")).toMatchObject({ ok: false });
  });
});

describe("settings", () => {
  test("saveSettings writes every field, incl. the location toggles, and restores", async () => {
    const [s0, p0] = [await getSettings(), await getPrivateSettings()];
    try {
      const input = { ...settingsToFormInput(s0, p0), onlineEnabled: true, priceOneToOne: "30", passGcse10: "170.50", bankSortCode: "123456", bankAccountNumber: "87654321", groupVenue: "Hall" };
      expect(await saveSettings(input)).toEqual({ ok: true });
      const [s1, p1] = [await getSettings(), await getPrivateSettings()];
      expect(s1.onlineEnabled).toBe(true);
      expect(s1.priceOneToOnePence).toBe(3000);
      expect(s1.passPrices.GCSE["10"]).toBe(17050);
      expect(s1.groupVenue).toBe("Hall");
      expect(p1.bankSortCode).toBe("12-34-56");
      expect(p1.bankAccountNumber).toBe("87654321");
      expect(p1.calendarFeedToken).toBe(p0.calendarFeedToken);

      const bad = await saveSettings({ ...input, bankSortCode: "12", priceGroup: "x" });
      expect(bad).toMatchObject({ ok: false, errors: { bankSortCode: expect.any(String), priceGroup: expect.any(String) } });
      expect((await getSettings()).priceOneToOnePence).toBe(3000);
    } finally {
      expect(await saveSettings(settingsToFormInput(s0, p0))).toEqual({ ok: true });
    }
  });

  test("regenerateFeedToken replaces the token", async () => {
    const before = (await getPrivateSettings()).calendarFeedToken;
    try {
      const res = await regenerateFeedToken();
      expect(res.ok && res.token).toMatch(/^[0-9a-f]{48}$/);
      expect((await getPrivateSettings()).calendarFeedToken).not.toBe(before);
    } finally {
      await db.query("update settings_private set calendar_feed_token = $1", [before]);
    }
  });
});

describe("calendar feed and backup", () => {
  test("feed lists bookings and group sessions without medical info or home addresses", async () => {
    const p = await createUser({ fullName: "Pat Parent" });
    const c = await createChild(p.id, { firstName: "Aisha", schoolYear: 11 });
    await db.query("insert into agreements (child_id, policy_version, emergency_contact_name, emergency_contact_phone, medical_info, sen_info, consent_contact, signed_name) values ($1,'v','E','0','ASTHMA-SECRET','DYSLEXIA-SECRET',true,'Pat')", [c]);
    const start = new Date(Date.now() + 3 * DAY);
    const ins = (kind: string, location: string, status: string, offsetDays: number, address: string | null) =>
      db.query(
        `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until, status, price_pence, home_address)
         values ($1,$2,$3::booking_kind,$4::location_kind,$5::timestamptz,$5::timestamptz + interval '1 hour',$5::timestamptz + interval '1 hour',$6::booking_status,1000,$7)`,
        [p.id, c, kind, location, new Date(start.getTime() + offsetDays * DAY).toISOString(), status, address],
      );
    await ins("assessment", "tutor_place", "confirmed", 0, null);
    await ins("one_to_one", "home_visit", "confirmed", 1, "9 SECRET Street");
    await ins("one_to_one", "tutor_place", "cancelled", 2, null);
    await ins("one_to_one", "tutor_place", "confirmed", 200, null); // out of range
    await ins("one_to_one", "tutor_place", "confirmed", -40, null); // out of range

    await createSeries(series());
    const [g] = await sessionsOf("TEST Wednesday Group");
    await db.query(
      `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until, group_session_id, status, price_pence)
       select $1,$2,'group','group_venue',starts_at,ends_at,ends_at,id,'confirmed',price_pence from group_sessions where id = $3`,
      [p.id, c, g.id],
    );

    const entries = await loadFeedEntries();
    const titles = entries.map((e) => e.title);
    expect(titles).toContain("Assessment — Aisha (Y11, AQA Comb Sci) — Tutor's place");
    expect(titles).toContain("1-to-1 — Aisha (Y11, AQA Comb Sci) — Home visit");
    expect(titles).toContain("Group: TEST Wednesday Group (1 booked)");
    expect(entries.filter((e) => e.title.startsWith("1-to-1"))).toHaveLength(1);
    expect(entries.filter((e) => e.title.startsWith("Group:") && e.title.includes("TEST")).length).toBeGreaterThan(5);
    const blob = JSON.stringify(entries);
    for (const secret of ["SECRET", "ASTHMA", "DYSLEXIA", "Street"]) expect(blob).not.toContain(secret);
    // A booking's group seat is represented by the session, not listed twice.
    expect(entries.filter((e) => e.uid.startsWith("booking-"))).toHaveLength(2);
  });

  test("feed titles for a KS3 child (no exam board) say KS3", async () => {
    const p = await createUser({ fullName: "Kay Parent" });
    const c = await createChild(p.id, { firstName: "Kay", schoolYear: 8, level: "KS3" });
    const start = new Date(Date.now() + 3 * DAY).toISOString();
    await db.query(
      `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until, status, price_pence)
       values ($1,$2,'one_to_one','tutor_place',$3::timestamptz,$3::timestamptz + interval '1 hour',$3::timestamptz + interval '1 hour','confirmed',2000)`,
      [p.id, c, start],
    );
    const titles = (await loadFeedEntries()).map((e) => e.title);
    expect(titles).toContain("1-to-1 — Kay (Y8, KS3 Comb Sci) — Tutor's place");
    expect(titles.join(" ")).not.toContain("null");
  });

  test("backup holds every public table and is named by London date", async () => {
    const tables = (await rows<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")).map((t) => t.table_name).sort();
    expect([...BACKUP_TABLES].sort()).toEqual(tables);
    await createUser({ fullName: "Backup Parent" });
    const b = await buildBackup(new Date("2027-07-01T23:30:00Z"));
    expect(Object.keys(b.tables).sort()).toEqual(tables);
    expect(b.tables.profiles).toHaveLength(1);
    expect(b.tables.settings).toHaveLength(1);
    expect(backupFilename(new Date("2027-07-01T23:30:00Z"))).toBe("studylabco-backup-2027-07-02.json");
  });
});
