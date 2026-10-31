import { LabIllustration } from "@/components/site/LabIllustration";
import { Badge, TickIcon } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { TRUST_BADGES } from "@/lib/site";

// Placeholder home: the full page is built in a later task on these primitives.
export default function HomePage() {
  return (
    <section aria-labelledby="hero-title" className="bg-graph border-b border-sky-200">
      <div className="mx-auto grid max-w-content items-center gap-10 px-5 py-14 sm:px-8 md:grid-cols-12 md:py-24">
        <div className="flex flex-col gap-6 md:col-span-7">
          <h1 id="hero-title" className="text-display text-balance motion-safe:animate-rise">
            GCSE Science tuition in Blackburn, from a qualified teacher
          </h1>
          <p className="max-w-prose text-lead text-navy-600 motion-safe:animate-rise [animation-delay:80ms]">
              Biology, Chemistry, Physics and Combined Science for Years 10 and 11, Foundation and Higher tier. Every new student starts
              with a £10 assessment lesson so we can plan around exactly what they need.
          </p>
          <div className="flex flex-col gap-3 motion-safe:animate-rise [animation-delay:160ms] sm:flex-row sm:flex-wrap">
            <ButtonLink href="/signup" size="lg" className="w-full sm:w-auto">
              Book your £10 Assessment Lesson
            </ButtonLink>
            <ButtonLink href="/lessons" size="lg" variant="secondary" className="w-full sm:w-auto">
              See lessons and prices
            </ButtonLink>
          </div>
          <div className="motion-safe:animate-rise [animation-delay:240ms]">
            <ul className="flex flex-wrap gap-2" aria-label="Credentials">
              {TRUST_BADGES.map((badge) => (
                <li key={badge}>
                  <Badge tone="neutral" icon={<TickIcon />}>
                    {badge}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <Reveal delay={200} className="mx-auto w-full max-w-sm md:col-span-5 md:max-w-none">
          <LabIllustration />
        </Reveal>
      </div>
    </section>
  );
}
