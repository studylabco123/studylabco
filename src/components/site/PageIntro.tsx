import type { ReactNode } from "react";

/** The graph-paper band at the top of every inner page: title and a short intro. */
export function PageIntro({ title, children, aside }: { title: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <section aria-labelledby="page-title" className="bg-graph border-b border-sky-200">
      <div className="mx-auto grid max-w-content gap-8 px-5 py-12 sm:px-8 md:grid-cols-12 md:items-end md:py-16">
        <div className="flex flex-col gap-4 md:col-span-8">
          <h1 id="page-title" className="text-h1 motion-safe:animate-rise">
            {title}
          </h1>
          {children ? (
            <div className="max-w-prose text-lead text-navy-600 motion-safe:animate-rise [animation-delay:80ms]">{children}</div>
          ) : null}
        </div>
        {aside ? <div className="md:col-span-4">{aside}</div> : null}
      </div>
    </section>
  );
}

/** A content section with an h2, on the standard rhythm. */
export function Section({
  id,
  title,
  intro,
  children,
  tone = "white",
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  tone?: "white" | "sky";
}) {
  return (
    <section aria-labelledby={id} className={tone === "sky" ? "border-y border-sky-200 bg-sky-50" : undefined}>
      <div className="mx-auto max-w-content px-5 py-14 sm:px-8 md:py-20">
        <h2 id={id} className="text-h2">
          {title}
        </h2>
        {intro ? <div className="mt-3 max-w-prose text-navy-600">{intro}</div> : null}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}
