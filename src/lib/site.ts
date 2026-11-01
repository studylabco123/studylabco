/** Static business details used until settings are wired in (ruling R1). */
export const SITE_NAME = "Study Lab Co";
export const FALLBACK_EMAIL = "studylabco123@gmail.com";

export type NavItem = { href: string; label: string };

export const MAIN_NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/lessons", label: "Lessons & Pricing" },
  { href: "/groups", label: "Group Sessions" },
  { href: "/faq", label: "Q&A" },
  { href: "/contact", label: "Contact" },
];

export const LEGAL_NAV: NavItem[] = [
  { href: "/terms", label: "Terms" },
  { href: "/refunds", label: "Refund Policy" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
  { href: "/safeguarding", label: "Safeguarding" },
  { href: "/accessibility", label: "Accessibility" },
];

export const TRUST_BADGES = ["Qualified Teacher (QTS)", "Enhanced DBS Checked", "All Exam Boards"] as const;

/** Format a UK phone number for a tel: link. */
export function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return `tel:${digits.startsWith("0") ? `+44${digits.slice(1)}` : digits}`;
}

/** WhatsApp chat link for a UK phone number. */
export function whatsappHref(phone: string): string {
  return `https://wa.me/${telHref(phone).replace(/^tel:\+?/, "")}`;
}
