import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { deleteResult, prepareResultUpload, publishResult, saveResult, unpublishResult } from "@/lib/admin/results-ops";
import { sendEmail, testOutbox } from "@/lib/email/send";
import { signedAttachmentUrl } from "@/lib/results/attachment";
import { createServiceClient } from "@/lib/supabase/service";
import { deleteAccount } from "@/lib/account-deletion";
import { asAnon, asUser, closeDb, createChild, createUser, db, resetData } from "./setup";

let parent: { id: string; email: string };
let other: { id: string; email: string };
let childId: string;
const bucket = () => createServiceClient().storage.from("results");
const now = new Date("2026-11-01T12:00:00Z");
const PNG = new Uint8Array([137, 80, 78, 71]);

const form = (over: Record<string, unknown> = {}) => ({
  childId,
  title: "Cells test",
  kind: "end_of_topic",
  takenOn: "2026-10-20",
  score: "34",
  outOf: "50",
  grade: "6",
  wentWell: "Good recall",
  toImprove: "Show working",
  ...over,
});

async function upload(): Promise<string> {
  const t = await prepareResultUpload("image/png", PNG.length, "2026-10-20");
  if (!t.ok) throw new Error(t.message);
  const up = await bucket().uploadToSignedUrl(t.path, t.token, new Blob([PNG as BlobPart], { type: "image/png" }), { contentType: "image/png" });
  if (up.error) throw up.error;
  return t.path;
}
const objects = async () => (await db.query<{ name: string }>("select name from storage.objects where bucket_id = 'results'")).rows.map((r) => r.name);
async function create(over: Record<string, unknown> = {}): Promise<string> {
  const r = await saveResult(form(over), { now });
  if (!r.ok) throw new Error(r.message);
  return (await db.query<{ id: string }>("select id from test_results order by created_at desc limit 1")).rows[0].id;
}

const env = { ...process.env };
let out: { mockRestore(): void };
beforeEach(async () => {
  await resetData();
  const left = await objects();
  if (left.length) await bucket().remove(left);
  parent = await createUser({ fullName: "Pat Parent" });
  other = await createUser({ fullName: "Other Parent" });
  childId = await createChild(parent.id, { firstName: "Sam" });
  process.env.EMAIL_TRANSPORT = "log";
  out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  testOutbox.length = 0;
});
afterEach(() => {
  out.mockRestore();
  process.env = { ...env };
});
afterAll(closeDb);

describe("RLS", () => {
  test("parent sees only own child's published results", async () => {
    const pub = await create({ title: "Published" });
    await create({ title: "Draft" });
    await publishResult(pub, { now });
    const rows = (await asUser(parent.id).query("select title from test_results")).rows;
    expect(rows).toEqual([{ title: "Published" }]);
  });

  test("parent cannot read draft result or its attachment", async () => {
    const path = await upload();
    const id = await create({ attachmentPath: path });
    expect((await asUser(parent.id).query("select id from test_results")).rows).toEqual([]);
    expect((await asUser(parent.id).query("select name from storage.objects where bucket_id = 'results'")).rows).toEqual([]);
    expect(await signedAttachmentUrl(id, parent.id)).toBeNull();
    await publishResult(id, { now });
    // Published: still no direct storage access, only the server-made link.
    expect((await asUser(parent.id).query("select name from storage.objects where bucket_id = 'results'")).rows).toEqual([]);
    const url = await signedAttachmentUrl(id, parent.id);
    expect(url).toMatch(/token=/);
    expect((await fetch(url!)).status).toBe(200);
  });

  test("other parent sees nothing", async () => {
    const id = await create({ attachmentPath: await upload() });
    await publishResult(id, { now });
    expect((await asUser(other.id).query("select id from test_results")).rows).toEqual([]);
    expect(await signedAttachmentUrl(id, other.id)).toBeNull();
    await expect(asAnon().query("select id from test_results")).rejects.toThrow();
  });

  test("parents cannot write results", async () => {
    const id = await create();
    await publishResult(id, { now });
    await expect(
      asUser(parent.id).query("insert into test_results (child_id, title, kind, taken_on, score, out_of, went_well, to_improve) values ($1,'x','other','2026-10-01',1,2,'a','b')", [childId]),
    ).rejects.toThrow();
    const upd = await asUser(parent.id).query("update test_results set title = 'hacked' returning id");
    expect(upd.rows).toEqual([]);
    const del = await asUser(parent.id).query("delete from test_results returning id");
    expect(del.rows).toEqual([]);
  });
});

describe("constraints", () => {
  test("score > out_of rejected", async () => {
    await expect(
      db.query("insert into test_results (child_id, title, kind, taken_on, score, out_of, went_well, to_improve) values ($1,'x','other','2026-10-01',51,50,'a','b')", [childId]),
    ).rejects.toThrow(/test_results_score/);
    const r = await saveResult(form({ score: "51" }), { now });
    expect(r.ok).toBe(false);
  });
});

describe("publish", () => {
  test("publish emails parent once", async () => {
    const id = await create();
    expect(await publishResult(id, { now })).toEqual({ ok: true });
    expect(testOutbox).toHaveLength(1);
    expect(testOutbox[0]).toMatchObject({ to: parent.email, subject: "New results for Sam" });
    expect(testOutbox[0].text).toContain(`/account/children/${childId}/results`);
    for (const secret of ["34 / 50", "68%", "Good recall", "Show working", "Cells test"]) expect(testOutbox[0].text).not.toContain(secret);
    // Publishing again, or editing a published result, sends nothing more.
    await publishResult(id, { now });
    await saveResult(form({ id, title: "Edited" }), { now });
    expect(testOutbox).toHaveLength(1);
    expect((await db.query("select published_at from test_results where id = $1", [id])).rows[0].published_at).not.toBeNull();
    // Unpublished then published again: the parent hears about it again.
    expect(await unpublishResult(id)).toEqual({ ok: true });
    expect((await db.query("select published_at from test_results where id = $1", [id])).rows[0].published_at).toBeNull();
    expect((await asUser(parent.id).query("select id from test_results")).rows).toEqual([]);
    await publishResult(id, { now });
    expect(testOutbox).toHaveLength(2);
  });

  test("a failed email does not stop the publish", async () => {
    const id = await create();
    process.env.EMAIL_TRANSPORT = "resend";
    delete process.env.RESEND_API_KEY;
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await publishResult(id, { now })).toEqual({ ok: true });
    err.mockRestore();
    expect((await db.query("select published_at from test_results where id = $1", [id])).rows[0].published_at).not.toBeNull();
  });
});

describe("attachments", () => {
  test("ticket only for allowed types, at results/YYYY/uuid.ext", async () => {
    const t = await prepareResultUpload("application/pdf", 1000, "2026-10-20");
    expect(t.ok && t.path).toMatch(/^results\/2026\/[0-9a-f-]{36}\.pdf$/);
    for (const [type, size] of [["image/svg+xml", 10], ["image/png", 10 * 1024 * 1024 + 1], ["image/png", 0]] as const)
      expect((await prepareResultUpload(type, size, "2026-10-20")).ok).toBe(false);
  });

  test("save verifies the object; foreign paths and other buckets are refused; one result per object", async () => {
    expect((await saveResult(form({ attachmentPath: "receipts/2026/0b9f3c1e-5a2d-4e7f-9c3b-1a2b3c4d5e6f.png" }), { now })).ok).toBe(false);
    expect((await saveResult(form({ attachmentPath: "results/2026/0b9f3c1e-5a2d-4e7f-9c3b-1a2b3c4d5e6f.png" }), { now })).ok).toBe(false); // never uploaded
    const path = await upload();
    const a = await create({ attachmentPath: path });
    expect((await saveResult(form({ attachmentPath: path }), { now })).ok).toBe(false); // already another result's
    expect((await db.query("select count(*)::int n from test_results")).rows[0].n).toBe(1);
    expect(a).toBeTruthy();
  });

  test("re-saving a result with its own attachment path is allowed", async () => {
    const path = await upload();
    const id = await create({ attachmentPath: path });
    expect(await saveResult(form({ id, attachmentPath: path, title: "Again" }), { now })).toEqual({ ok: true });
    expect(await objects()).toEqual([path]);
  });

  test("replacing the attachment removes the old object; removing it too", async () => {
    const first = await upload();
    const id = await create({ attachmentPath: first });
    const second = await upload();
    expect(await saveResult(form({ id, attachmentPath: second }), { now })).toEqual({ ok: true });
    expect(await objects()).toEqual([second]);
    // Leaving it out keeps it.
    expect(await saveResult(form({ id, title: "Renamed" }), { now })).toEqual({ ok: true });
    expect(await objects()).toEqual([second]);
    expect(await saveResult(form({ id, attachmentPath: null }), { now })).toEqual({ ok: true });
    expect(await objects()).toEqual([]);
  });

  test("an uploaded object is removed again if the save is refused", async () => {
    const path = await upload();
    const r = await saveResult(form({ attachmentPath: path, score: "99" }), { now });
    expect(r.ok).toBe(false);
    expect(await objects()).toEqual([]);
  });

  test("delete removes attachment object", async () => {
    const path = await upload();
    const id = await create({ attachmentPath: path });
    expect(await objects()).toEqual([path]);
    expect(await deleteResult(id)).toEqual({ ok: true });
    expect(await objects()).toEqual([]);
    expect((await db.query("select count(*)::int n from test_results")).rows[0].n).toBe(0);
  });

  test("the results bucket is private and admin-only", async () => {
    const b = (await db.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'results'")).rows[0];
    expect(b.public).toBe(false);
    expect(Number(b.file_size_limit)).toBe(10485760);
    expect(b.allowed_mime_types).toContain("application/pdf");
    expect(b.allowed_mime_types).not.toContain("image/svg+xml");
  });
});

describe("account deletion", () => {
  test("removes result rows and their attachment objects", async () => {
    const path = await upload();
    await create({ attachmentPath: path });
    // GoTrue cannot load users inserted raw with NULL token columns (its admin delete needs to).
    await db.query(
      `update auth.users set confirmation_token = '', recovery_token = '', email_change = '',
         email_change_token_new = '', email_change_token_current = '', phone_change = '',
         phone_change_token = '', reauthentication_token = '' where id = $1`,
      [parent.id],
    );
    const id = (await db.query<{ id: string }>("select id from test_results")).rows[0].id;
    expect(await publishResult(id, { now })).toEqual({ ok: true });
    await db.query("insert into email_log (template, to_email) values ('group_message', $1)", [parent.email.toUpperCase()]);
    expect((await db.query("select count(*)::int n from email_log")).rows[0].n).toBe(2);
    expect(await deleteAccount(parent.id, { now })).toEqual({ ok: true });
    expect((await db.query("select count(*)::int n from email_log where lower(to_email) = lower($1)", [parent.email])).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from email_log")).rows[0].n).toBe(0);
    expect(await objects()).toEqual([]);
    expect((await db.query("select count(*)::int n from test_results")).rows[0].n).toBe(0);
  });
});

test("sendEmail is idempotent per result", async () => {
  const id = await create();
  const args = { to: "a@example.test", template: "results_published", props: { parentName: "Pat", childName: "Sam", link: "http://x/y" }, resultId: id } as const;
  expect(await sendEmail(args)).toBe("sent");
  expect(await sendEmail(args)).toBe("skipped");
});
