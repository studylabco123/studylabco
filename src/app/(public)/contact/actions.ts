"use server";

import { turnstileToken } from "@/lib/auth/turnstile-token";
import { contactSchema, type ContactField } from "@/lib/contact/validation";
import { businessInbox } from "@/lib/email/config";
import { sendEmail } from "@/lib/email/send";
import { FALLBACK_EMAIL } from "@/lib/site";
import { verifyTurnstile } from "@/lib/turnstile";

export interface ContactState {
  sent?: boolean;
  errors?: Partial<Record<ContactField, string>>;
  formError?: string;
  /** Echoed back so the form keeps what was typed after an error. */
  values?: Record<ContactField, string>;
}

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

/**
 * Emails a contact-form message to the business inbox, with reply-to set to
 * the sender. Nothing is stored apart from the email log row (template and
 * the inbox address, no message content).
 */
export async function sendContact(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const values = {
    name: text(formData, "name"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    message: text(formData, "message"),
  };
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    const errors: ContactState["errors"] = {};
    for (const issue of parsed.error.issues) errors[issue.path[0] as ContactField] ??= issue.message;
    return { errors, values };
  }
  if (!(await verifyTurnstile(turnstileToken(formData) ?? null))) {
    return { formError: "We couldn't confirm you're not a robot. Please try again.", values };
  }
  try {
    await sendEmail({ to: businessInbox(), template: "contact_message", props: parsed.data, replyTo: parsed.data.email });
  } catch (err) {
    console.error("contact form email failed", err);
    return {
      formError: `Your message didn't send. Please try again, or email ${FALLBACK_EMAIL} directly.`,
      values,
    };
  }
  return { sent: true };
}
