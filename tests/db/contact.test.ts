import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { sendContact } from "@/app/(public)/contact/actions";
import { closeDb, db, resetData } from "./setup";

const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ name: "Casey", email: "casey@example.test", phone: "", message: "Hello", website: "", ...over })) {
    fd.set(k, v);
  }
  return fd;
};
const sent = async () => (await db.query("select count(*)::int as n from email_log where template = 'contact_message'")).rows[0].n as number;

let out: { mockRestore(): void };
beforeEach(async () => {
  await resetData();
  vi.stubEnv("EMAIL_TRANSPORT", "log");
  out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(() => {
  out.mockRestore();
  vi.unstubAllEnvs();
});
afterAll(closeDb);

describe("sendContact", () => {
  test("a real message is emailed", async () => {
    expect(await sendContact({}, form())).toEqual({ sent: true });
    expect(await sent()).toBe(1);
  });

  test("a filled-in honeypot looks like success but sends nothing", async () => {
    expect(await sendContact({}, form({ website: "https://spam.example" }))).toEqual({ sent: true });
    expect(await sent()).toBe(0);
  });

  test("invalid input is returned with messages and nothing is sent", async () => {
    const r = await sendContact({}, form({ email: "nope" }));
    expect(r.errors?.email).toBe("Enter a valid email address");
    expect(await sent()).toBe(0);
  });
});
