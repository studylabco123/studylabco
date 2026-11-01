/**
 * Contact links for the admin family page, built from the stored phone/email.
 * UK numbers entered as 07123 456789 become +447123456789 for tel: and
 * 447123456789 for https://wa.me/.
 */

/** International form ("+447123456789") of a UK or already-international number, or null if unreadable. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.replace(/[\s().-]+/g, "");
  if (!/^\+?\d+$/.test(s)) return null;
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("00")) s = s.slice(2);
  else if (s.startsWith("0")) s = `44${s.slice(1)}`;
  else if (!s.startsWith("44")) return null;
  return s.length >= 10 && s.length <= 15 ? `+${s}` : null;
}

export function telHref(raw: string | null | undefined): string | null {
  const n = toE164(raw);
  return n ? `tel:${n}` : null;
}

export function whatsappHref(raw: string | null | undefined): string | null {
  const n = toE164(raw);
  return n ? `https://wa.me/${n.slice(1)}` : null;
}

export function mailtoHref(email: string | null | undefined): string | null {
  const e = email?.trim();
  if (!e) return null;
  const at = e.indexOf("@");
  return at < 0 ? `mailto:${encodeURIComponent(e)}` : `mailto:${encodeURIComponent(e.slice(0, at))}@${e.slice(at + 1)}`;
}
