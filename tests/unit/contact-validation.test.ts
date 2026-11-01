import { describe, expect, it } from "vitest";
import { contactSchema, MESSAGE_MAX } from "@/lib/contact/validation";

const ok = { name: "Casey Parent", email: "Casey@Example.test ", phone: "", message: "Hello" };

describe("contactSchema", () => {
  it("accepts a name, email and message; phone is optional", () => {
    const r = contactSchema.safeParse(ok);
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ name: "Casey Parent", email: "casey@example.test", phone: null, message: "Hello" });
  });

  it("keeps a phone number when given", () => {
    expect(contactSchema.parse({ ...ok, phone: " 07123 456789 " }).phone).toBe("07123 456789");
  });

  it("explains each missing or invalid field", () => {
    const r = contactSchema.safeParse({ name: " ", email: "nope", phone: "", message: "" });
    expect(r.success).toBe(false);
    const msgs = Object.fromEntries(r.error!.issues.map((i) => [i.path[0], i.message]));
    expect(msgs).toEqual({
      name: "Enter your name",
      email: "Enter a valid email address",
      message: "Write a message",
    });
  });

  it("limits the message to 2,000 characters and keeps newlines", () => {
    expect(MESSAGE_MAX).toBe(2000);
    expect(contactSchema.safeParse({ ...ok, message: "x".repeat(2000) }).success).toBe(true);
    const long = contactSchema.safeParse({ ...ok, message: "x".repeat(2001) });
    expect(long.error?.issues[0].message).toBe("Keep your message under 2,000 characters");
    expect(contactSchema.parse({ ...ok, message: "Line one\nLine two" }).message).toBe("Line one\nLine two");
  });

  it("refuses names and phones that are too long or contain line breaks", () => {
    expect(contactSchema.safeParse({ ...ok, name: "x".repeat(101) }).success).toBe(false);
    expect(contactSchema.safeParse({ ...ok, name: "Lee\r\nBcc: x@y" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...ok, phone: "1".repeat(31) }).success).toBe(false);
  });
});
