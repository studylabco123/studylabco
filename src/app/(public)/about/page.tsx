import Link from "next/link";
import { PageIntro, Section } from "@/components/site/PageIntro";
import { ButtonLink } from "@/components/ui/Button";
import { formatPence } from "@/lib/format";
import { bookHref, publicSettings } from "@/lib/public/data";
import { pageMetadata } from "@/lib/public/meta";

export const metadata = pageMetadata(
  "About the tutor",
  "Study Lab Co is run by a qualified secondary science teacher: PGCE with QTS from Edge Hill University, BSc Biology from the University of Salford, enhanced DBS checked.",
  "/about",
);

/** Spec §3.1, in the order they were gained. */
const QUALIFICATIONS: { award: string; where: string }[] = [
  { award: "Grade 9 GCSE Science", where: "Jamiatul Ilm Wal Huda, Blackburn" },
  { award: "A-Levels in Biology, Chemistry and Psychology", where: "Clitheroe Royal Grammar School Sixth Form" },
  { award: "BSc Biology", where: "University of Salford" },
  { award: "PGCE with QTS (Qualified Teacher Status)", where: "Edge Hill University" },
];

const APPROACH: { title: string; body: string }[] = [
  {
    title: "Start from where your child is",
    body: "The Assessment Lesson shows which topics are secure and which need work. Lessons are then planned around those gaps, not a one-size-fits-all scheme.",
  },
  {
    title: "Teach to the specification",
    body: "I teach to your child's exam board and tier, using the same required practicals, command words and mark schemes they will meet in the exam.",
  },
  {
    title: "Practise answering, not just reading",
    body: "Most lessons end with exam-style questions, so students learn how to turn what they know into marks, including the longer six-mark answers.",
  },
  {
    title: "Keep you in the loop",
    body: "You'll hear what we covered and what to focus on next. If something isn't working, we change the plan.",
  },
];

export default async function AboutPage() {
  const [settings, href] = await Promise.all([publicSettings(), bookHref()]);
  return (
    <>
      <PageIntro title="About the tutor">
        <p>
          I&apos;m a qualified secondary science teacher, and I set up Study Lab Co to offer focused GCSE Science lessons to
          students in Blackburn. Every lesson is planned and taught by me.
        </p>
      </PageIntro>

      <Section id="qualifications" title="Qualifications and checks">
        <div className="grid gap-10 md:grid-cols-12">
          <ol aria-label="Qualifications" className="relative flex flex-col gap-8 border-l-2 border-sky-300 pl-8 md:col-span-7">
            {QUALIFICATIONS.map((q) => (
              <li key={q.award} className="relative">
                <span aria-hidden="true" className="absolute top-1.5 -left-[2.5625rem] size-4 rounded-full border-2 border-navy-900 bg-white" />
                <p className="font-display text-h3 font-semibold">{q.award}</p>
                <p className="text-navy-600">{q.where}</p>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-4 self-start rounded-card bg-sky-100 p-6 sm:p-8 md:col-span-5">
            <h3 className="text-h3">Enhanced DBS checked</h3>
            <p className="text-small text-navy-600">
              I hold an enhanced DBS check, the level required for teaching children. A parent or guardian is present for
              the talk at the end of every Assessment Lesson, and someone must be at home during home visits.
            </p>
            <p className="text-small">
              <Link href="/safeguarding" className="font-semibold underline decoration-sky-500 decoration-2 underline-offset-4">
                How I keep students safe
              </Link>
            </p>
          </div>
        </div>
      </Section>

      <Section id="approach" title="How I teach" tone="sky">
        <ul className="grid gap-x-10 gap-y-8 md:grid-cols-2">
          {APPROACH.map((a) => (
            <li key={a.title} className="flex flex-col gap-2 border-t-2 border-navy-900 pt-4">
              <h3 className="text-h3">{a.title}</h3>
              <p className="text-navy-600">{a.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <section aria-labelledby="about-start">
        <div className="mx-auto flex max-w-content flex-col items-start gap-5 px-5 py-16 sm:px-8 md:py-20">
          <h2 id="about-start" className="text-h2">
            Meet me at the Assessment Lesson
          </h2>
          <p className="max-w-prose text-navy-600">
            It&apos;s the best way to see whether lessons are right for your child. It costs{" "}
            {formatPence(settings.priceAssessmentPence)} and lasts 60 minutes, including a 15-minute talk with you.
          </p>
          <ButtonLink href={href} size="lg">
            Book your {formatPence(settings.priceAssessmentPence)} Assessment Lesson
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
