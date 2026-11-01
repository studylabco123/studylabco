import { Badge, TickIcon } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { formatPence } from "@/lib/format";
import { TRUST_BADGES } from "@/lib/site";
import { LabIllustration } from "./LabIllustration";

export type HeroProps = {
  assessmentPence: number;
  /** Assessment price as a home visit, or null when home visits are off. */
  assessmentHomePence: number | null;
  bookHref: string;
};

/**
 * Home hero on graph paper: the promise, the first step and the credentials,
 * with the flask drawing and a "first lesson" note pinned beside it.
 */
export function Hero({ assessmentPence, assessmentHomePence, bookHref }: HeroProps) {
  const price = formatPence(assessmentPence);
  return (
    <section aria-labelledby="hero-title" className="bg-graph border-b border-sky-200">
      <div className="mx-auto grid max-w-content items-center gap-12 px-5 pt-12 pb-16 sm:px-8 md:grid-cols-12 md:gap-8 md:py-24">
        <div className="flex flex-col gap-6 md:col-span-7">
          <h1 id="hero-title" className="text-display text-balance motion-safe:animate-rise">
            GCSE Science tuition in Blackburn, from a qualified teacher
          </h1>
          <p className="max-w-prose text-lead text-navy-600 motion-safe:animate-rise [animation-delay:80ms]">
            Biology, Chemistry, Physics and Combined Science for Years 10 and 11, Foundation and Higher tier. Every new
            student starts with an Assessment Lesson, so lessons are planned around exactly what your child needs.
          </p>
          <div className="flex flex-col gap-3 motion-safe:animate-rise [animation-delay:160ms] sm:flex-row sm:flex-wrap">
            <ButtonLink href={bookHref} size="lg" className="w-full sm:w-auto">
              Book your {price} Assessment Lesson
            </ButtonLink>
            <ButtonLink href="/lessons" size="lg" variant="secondary" className="w-full sm:w-auto">
              See lessons and prices
            </ButtonLink>
          </div>
          <ul className="flex flex-wrap gap-2 motion-safe:animate-rise [animation-delay:240ms]" aria-label="Credentials">
            {TRUST_BADGES.map((badge) => (
              <li key={badge}>
                <Badge tone="neutral" icon={<TickIcon />}>
                  {badge}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-sm md:col-span-5 md:max-w-none">
          <Reveal delay={200}>
            <LabIllustration className="mx-auto max-w-[19rem] md:max-w-none" />
          </Reveal>
          <aside
            aria-labelledby="first-lesson"
            className="relative -mt-10 ml-auto w-[88%] rounded-card border border-sky-200 bg-white p-5 shadow-card motion-safe:animate-rise [animation-delay:320ms] sm:p-6 md:-mt-16 md:w-[82%]"
          >
            <h2 id="first-lesson" className="font-display text-small font-semibold text-navy-600">
              Your first lesson
            </h2>
            <p className="mt-1 font-display text-h3 font-semibold">Assessment Lesson, 60 minutes</p>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-small">
              <dt>At the tutor&apos;s place</dt>
              <dd className="font-display font-semibold tabular-nums">{price}</dd>
              {assessmentHomePence !== null ? (
                <>
                  <dt>Home visit</dt>
                  <dd className="font-display font-semibold tabular-nums">{formatPence(assessmentHomePence)}</dd>
                </>
              ) : null}
            </dl>
            <p className="mt-3 border-t border-sky-200 pt-3 text-fine text-navy-600">
              Includes a 15-minute talk with you, the parent or guardian.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
