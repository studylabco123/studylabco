import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

/** Centred narrow card used by every auth page. */
export function AuthCard({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bg-graph">
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-5 py-12 sm:px-8 md:py-16">
        <div className="flex flex-col gap-3">
          <h1 className="text-h1 text-balance">{title}</h1>
          {intro ? <p className="text-lead text-navy-600">{intro}</p> : null}
        </div>
        <Card raised>{children}</Card>
      </div>
    </div>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-field border-2 border-danger-700 bg-white px-3.5 py-2.5 text-small font-semibold text-danger-700">
      {children}
    </p>
  );
}
