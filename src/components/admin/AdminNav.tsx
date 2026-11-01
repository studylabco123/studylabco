"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/admin", label: "Today" },
  { href: "/admin/calendar", label: "Calendar" },
  { href: "/admin/groups", label: "Groups" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/families", label: "Families" },
  { href: "/admin/money", label: "Money" },
  { href: "/admin/settings", label: "Settings" },
];

/** "/admin" only matches itself; every other section also owns its sub-pages (e.g. /admin/families/123). */
export function isAdminCurrent(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The admin section links; the current section is marked with aria-current="page" and a filled pill. */
export function AdminNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Admin">
      <ul className="flex flex-wrap gap-x-1 gap-y-1">
        {NAV.map((item) => {
          const current = isAdminCurrent(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full px-4 font-display text-small font-medium text-navy-900 transition-colors duration-150 hover:bg-sky-200",
                  current && "bg-navy-900 text-white hover:bg-navy-800",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
