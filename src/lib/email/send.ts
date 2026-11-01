import "server-only";
import { render } from "@react-email/components";
import { createElement } from "react";
import { Resend } from "resend";
import { isRealProduction } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";
import { TEMPLATES, type TemplateName, type TemplateProps } from "./registry";

export interface SendEmailArgs<T extends TemplateName> {
  to: string;
  template: T;
  props: TemplateProps<T>;
  /** With the template, makes the email idempotent for this booking. */
  bookingId?: string;
  /** For pass-level emails (no single booking): idempotent per pass and template. */
  passId?: string;
  /** Where replies go (the contact form sets the sender's address). */
  replyTo?: string;
}

const SUBJECT_MAX = 150;

/** One line (no CR/LF, so no header injection), at most 150 characters. */
export function cleanSubject(raw: string): string {
  const one = raw.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return one.length > SUBJECT_MAX ? `${one.slice(0, SUBJECT_MAX - 1).trimEnd()}…` : one;
}

type Transport = "resend" | "log";

/**
 * Which transport sends email (review I4).
 * - Real production (see isRealProduction): always Resend. A missing
 *   RESEND_API_KEY or EMAIL_FROM throws, so nothing is silently "sent" to the
 *   logs and the caller's catch reports it; EMAIL_TRANSPORT=log is ignored.
 * - Elsewhere (development, tests, the local e2e production build):
 *   EMAIL_TRANSPORT if set, else Resend when a key is present, else the log.
 */
export function emailTransport(): Transport {
  if (isRealProduction()) {
    const missing = ["RESEND_API_KEY", "EMAIL_FROM"].filter((k) => !process.env[k]);
    if (missing.length) {
      throw new Error(`Email is not configured: set ${missing.join(" and ")} in the production environment`);
    }
    return "resend";
  }
  const t = process.env.EMAIL_TRANSPORT;
  if (t === "resend" || t === "log") return t;
  return process.env.RESEND_API_KEY ? "resend" : "log";
}

/** The log transport's one line: the template and the recipient's domain only, never the body, subject or address. */
export function logLine(to: string, template: string): string {
  const at = to.lastIndexOf("@");
  return `${JSON.stringify({ email: { template, toDomain: at >= 0 ? to.slice(at + 1) : "" } })}\n`;
}

export interface CapturedEmail {
  to: string;
  template: string;
  subject: string;
  text: string;
  replyTo?: string;
}

/**
 * Emails the log transport would have sent, kept in memory under Vitest only
 * (so tests can check content without the body ever being printed). Always
 * empty in the app.
 */
export const testOutbox: CapturedEmail[] = [];

/**
 * Records the email in email_log first, then sends it. A unique conflict
 * (same template already sent for this booking/pass) means 'skipped'. If the
 * transport fails the log row is removed so a retry can send, and the error is
 * rethrown: callers on a user action catch and log it.
 */
export async function sendEmail<T extends TemplateName>(args: SendEmailArgs<T>): Promise<"sent" | "skipped"> {
  // Decide (and fail on missing configuration) before anything is logged as sent.
  const via = emailTransport();
  const c = createServiceClient();
  const inserted = await c
    .from("email_log")
    .insert({
      booking_id: args.bookingId ?? null,
      pass_id: args.passId ?? null,
      template: args.template,
      to_email: args.to,
    })
    .select("id")
    .single();
  if (inserted.error) {
    if (inserted.error.code === "23505") return "skipped";
    throw new Error(`Could not record email: ${inserted.error.message}`);
  }
  const logId = inserted.data.id as string;

  try {
    const def = TEMPLATES[args.template] as unknown as {
      component: (p: unknown) => React.ReactElement;
      subject: (p: unknown) => string;
    };
    const element = createElement(def.component as never, args.props as never);
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    const subject = cleanSubject(def.subject(args.props));
    const replyTo = args.replyTo?.replace(/[\r\n]/g, "") || undefined;

    if (via === "log") {
      process.stdout.write(logLine(args.to, args.template));
      if (process.env.VITEST) testOutbox.push({ to: args.to, template: args.template, subject, text, replyTo });
    } else {
      const key = process.env.RESEND_API_KEY;
      const from = process.env.EMAIL_FROM;
      if (!key || !from) throw new Error("RESEND_API_KEY and EMAIL_FROM must be set for the resend transport");
      const res = await new Resend(key).emails.send({ from, to: args.to, subject, html, text, ...(replyTo ? { replyTo } : {}) });
      if (res.error) throw new Error(`Resend: ${res.error.message}`);
    }
  } catch (err) {
    await c.from("email_log").delete().eq("id", logId);
    throw err;
  }
  return "sent";
}
