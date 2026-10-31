"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { FALLBACK_EMAIL, MAIN_NAV, telHref } from "@/lib/site";
import { Logo } from "./Logo";

export type HeaderProps = {
  /** Business email from settings; falls back to the static address. */
  email?: string;
  /** Business phone from settings; hidden when absent. */
  phone?: string;
};

function isCurrent(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Header({ email = FALLBACK_EMAIL, phone }: HeaderProps) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // Move focus into the menu when it opens.
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>("a, button")?.focus();
  }, [open]);

  // Close on Escape (returning focus to the button) or on a click outside the header.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  // Close after navigating.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header ref={headerRef} className="sticky top-0 z-40 border-b border-sky-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-18 max-w-content items-center gap-3 px-5 sm:h-20 sm:px-8">
        <Link href="/" className="-ml-1 flex items-center gap-3 rounded-full p-1">
          <Logo size={52} priority className="size-12 sm:size-14" />
          <span className="hidden font-display text-lead font-semibold tracking-tight whitespace-nowrap sm:block" aria-hidden="true">
            Study Lab Co
          </span>
        </Link>

        <nav aria-label="Main" className="ml-auto hidden xl:block">
          <ul className="flex items-center gap-1">
            {MAIN_NAV.map((item) => {
              const current = isCurrent(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full px-3 font-display text-small font-medium whitespace-nowrap transition-colors duration-150 hover:bg-sky-100",
                      current && "bg-sky-100",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 xl:ml-2">
          <Link
            href="/login"
            className="hidden min-h-11 items-center rounded-full px-3 font-display text-small font-medium whitespace-nowrap underline decoration-sky-500 decoration-2 underline-offset-4 hover:bg-sky-100 xl:inline-flex"
          >
            Log in
          </Link>
          <ButtonLink href="/signup" className="px-4 sm:px-5">
            Book Assessment
          </ButtonLink>
          <button
            ref={buttonRef}
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 font-display text-small font-medium hover:bg-sky-100 xl:hidden"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
            <span className="max-[369px]:sr-only">Menu</span>
          </button>
        </div>
      </div>

      <div
        id="mobile-menu"
        ref={menuRef}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-sky-200 bg-white shadow-pop motion-safe:animate-menu-in xl:hidden"
      >
        <nav aria-label="Main menu" className="mx-auto max-w-content px-5 py-4 sm:px-8">
          <ul className="flex flex-col">
            {MAIN_NAV.map((item) => {
              const current = isCurrent(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex min-h-12 items-center rounded-field px-3 font-display text-lead font-medium hover:bg-sky-100",
                      current && "bg-sky-100",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li className="mt-2 border-t border-sky-200 pt-2">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center rounded-field px-3 font-display text-lead font-medium hover:bg-sky-100"
              >
                Log in
              </Link>
            </li>
          </ul>
          <p className="mt-3 px-3 text-small text-navy-600">
            Questions? Email{" "}
            <a href={`mailto:${email}`} className="font-semibold text-navy-900 underline underline-offset-4">
              {email}
            </a>
            {phone ? (
              <>
                {" "}
                or call{" "}
                <a href={telHref(phone)} className="font-semibold text-navy-900 underline underline-offset-4">
                  {phone}
                </a>
              </>
            ) : null}
            .
          </p>
        </nav>
      </div>
    </header>
  );
}
