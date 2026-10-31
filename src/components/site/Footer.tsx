import Link from "next/link";
import { Badge, TickIcon } from "@/components/ui/Badge";
import { FALLBACK_EMAIL, LEGAL_NAV, MAIN_NAV, SITE_NAME, TRUST_BADGES, telHref } from "@/lib/site";
import { Logo } from "./Logo";

export type FooterProps = {
  /** Business email from settings; falls back to the static address. */
  email?: string;
  /** Business phone from settings; hidden when absent. */
  phone?: string;
};

const linkClass =
  "inline-flex min-h-11 items-center underline-offset-4 decoration-sky-300 hover:underline sm:min-h-9";

export function Footer({ email = FALLBACK_EMAIL, phone }: FooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className="surface-navy relative overflow-hidden bg-navy-900 text-white">
      <RayMotif />
      <div className="relative mx-auto grid max-w-content gap-10 px-5 py-14 sm:px-8 md:grid-cols-12 md:py-16">
        <div className="flex flex-col gap-5 md:col-span-5">
          <div className="flex items-center gap-4">
            <Logo size={88} alt="" className="size-20 sm:size-22" />
            <div>
              <p className="font-display text-h3 font-semibold">{SITE_NAME}</p>
              <p className="text-small text-white/85">GCSE Science tuition in Blackburn from a qualified teacher.</p>
            </div>
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="Credentials">
            {TRUST_BADGES.map((badge) => (
              <li key={badge}>
                <Badge tone="onNavy" icon={<TickIcon />}>
                  {badge}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        <nav aria-labelledby="footer-explore" className="md:col-span-2">
          <h2 id="footer-explore" className="font-display text-small font-semibold text-white/85">
            Explore
          </h2>
          <ul className="mt-2 flex flex-col">
            {MAIN_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={linkClass}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-policies" className="md:col-span-2">
          <h2 id="footer-policies" className="font-display text-small font-semibold text-white/85">
            Policies
          </h2>
          <ul className="mt-2 flex flex-col">
            {LEGAL_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={linkClass}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="md:col-span-3">
          <h2 className="font-display text-small font-semibold text-white/85">Contact</h2>
          <ul className="mt-2 flex flex-col">
            <li>
              <a href={`mailto:${email}`} className={`${linkClass} break-all`}>
                {email}
              </a>
            </li>
            {phone ? (
              <li>
                <a href={telHref(phone)} className={linkClass}>
                  {phone}
                </a>
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="relative border-t border-white/15">
        <p className="mx-auto max-w-content px-5 py-5 text-fine text-white/85 sm:px-8">
          &copy; {year} {SITE_NAME}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

/** The logo's lightbulb rays, large and faint in the footer corner. Decorative. */
function RayMotif() {
  const rays = [-90, -60, -30, 0, -120, -150, 180];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 200"
      className="pointer-events-none absolute -right-20 -bottom-24 hidden size-96 text-sky-500 opacity-20 md:block"
      fill="none"
      stroke="currentColor"
      strokeWidth="6"
      strokeLinecap="round"
    >
      <circle cx="100" cy="100" r="34" />
      {rays.map((deg) => {
        const t = (deg * Math.PI) / 180;
        return (
          <line
            key={deg}
            x1={100 + 52 * Math.cos(t)}
            y1={100 + 52 * Math.sin(t)}
            x2={100 + 78 * Math.cos(t)}
            y2={100 + 78 * Math.sin(t)}
          />
        );
      })}
    </svg>
  );
}
