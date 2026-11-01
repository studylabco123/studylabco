import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL_UPDATED } from "@/lib/public/meta";
import { FALLBACK_EMAIL, LEGAL_NAV } from "@/lib/site";
import { PageIntro } from "./PageIntro";

/**
 * Policy page frame: title, "Last updated", plain-English body in a readable
 * column, and links to the other policies. Body elements are styled by .prose-site.
 */
export function LegalPage({ title, intro, path, children }: { title: string; intro: ReactNode; path: string; children: ReactNode }) {
  return (
    <>
      <PageIntro title={title}>
        <p>{intro}</p>
        <p className="mt-3 text-small">Last updated {LEGAL_UPDATED}</p>
      </PageIntro>
      <div className="mx-auto grid max-w-content gap-12 px-5 py-12 sm:px-8 md:grid-cols-12 md:py-16">
        <div className="prose-site md:col-span-8">{children}</div>
        <nav aria-labelledby="other-policies" className="md:col-span-4">
          <div className="rounded-card bg-sky-100 p-6 md:sticky md:top-28">
            <h2 id="other-policies" className="font-display text-small font-semibold">
              Our policies
            </h2>
            <ul className="mt-2 flex flex-col">
              {LEGAL_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={item.href === path ? "page" : undefined}
                    className="inline-flex min-h-11 items-center underline-offset-4 hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-sky-200 pt-4 text-small text-navy-600">
              Questions about a policy? Email{" "}
              <a href={`mailto:${FALLBACK_EMAIL}`} className="font-semibold break-all text-navy-900 underline underline-offset-4">
                {FALLBACK_EMAIL}
              </a>
              .
            </p>
          </div>
        </nav>
      </div>
    </>
  );
}
