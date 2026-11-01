import Link from "next/link";
import { SiteShell } from "@/components/site/SiteShell";
import { Button } from "@/components/ui/Button";
import { signOut } from "@/app/account/actions";

const NAV = [
  { href: "/admin", label: "Today" },
  { href: "/admin/calendar", label: "Calendar" },
  { href: "/admin/groups", label: "Groups" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/families", label: "Families" },
  { href: "/admin/money", label: "Money" },
  { href: "/admin/settings", label: "Settings" },
];

/** Site shell plus the admin navigation bar and sign-out button. */
export function AdminShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SiteShell>
      <div className="border-b-2 border-navy-900 bg-sky-100">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <nav aria-label="Admin">
            <ul className="flex flex-wrap gap-x-1 gap-y-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-11 items-center rounded-full px-4 font-display text-small font-medium text-navy-900 hover:bg-sky-200"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <form action={signOut}>
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
        </div>
      </div>
      <div className="mx-auto max-w-content px-5 py-8 sm:px-8">{children}</div>
    </SiteShell>
  );
}
