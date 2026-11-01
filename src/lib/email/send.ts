import "server-only";
import { render } from "@react-email/components";
import { createElement } from "react";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/service";
import { TEMPLATES, type TemplateName, type TemplateProps } from "./registry";

export interface SendEmailArgs<T extends TemplateName> {
  to: string;
  template: T;
  props: TemplateProps<T>;
  /** With the template, makes the email idempotent for this booking. */
  bookingId?: string;
  /** For block-level emails (no single booking): idempotent per block and template. */
  blockBookingId?: string;
}

type Transport = "resend" | "log";

function transport(): Transport {
  const t = process.env.EMAIL_TRANSPORT;
  if (t === "resend" || t === "log") return t;
  return process.env.RESEND_API_KEY ? "resend" : "log";
}

/**
 * Records the email in email_log first, then sends it. A unique conflict
 * (same template already sent for this booking/block) means 'skipped'. If the
 * transport fails the log row is removed so a retry can send, and the error is
 * rethrown: callers on a user action catch and log it.
 */
export async function sendEmail<T extends TemplateName>(args: SendEmailArgs<T>): Promise<"sent" | "skipped"> {
  const c = createServiceClient();
  const inserted = await c
    .from("email_log")
    .insert({
      booking_id: args.bookingId ?? null,
      block_booking_id: args.blockBookingId ?? null,
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
    const subject = def.subject(args.props);

    if (transport() === "log") {
      process.stdout.write(`${JSON.stringify({ email: { to: args.to, subject, template: args.template, text } })}\n`);
    } else {
      const key = process.env.RESEND_API_KEY;
      const from = process.env.EMAIL_FROM;
      if (!key || !from) throw new Error("RESEND_API_KEY and EMAIL_FROM must be set for the resend transport");
      const res = await new Resend(key).emails.send({ from, to: args.to, subject, html, text });
      if (res.error) throw new Error(`Resend: ${res.error.message}`);
    }
  } catch (err) {
    await c.from("email_log").delete().eq("id", logId);
    throw err;
  }
  return "sent";
}
