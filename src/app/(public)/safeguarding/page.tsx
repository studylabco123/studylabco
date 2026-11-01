import Link from "next/link";
import { LegalPage } from "@/components/site/LegalPage";
import { publicSettings } from "@/lib/public/data";
import { pageMetadata } from "@/lib/public/meta";
import { FALLBACK_EMAIL } from "@/lib/site";

export const metadata = pageMetadata(
  "Safeguarding",
  "How Study Lab Co keeps students safe: an enhanced DBS checked, qualified teacher, a parent present at the Assessment Lesson talk, and clear rules for home visits.",
  "/safeguarding",
);

export default async function SafeguardingPage() {
  const s = await publicSettings();
  return (
    <LegalPage
      title="Safeguarding"
      path="/safeguarding"
      intro="Keeping students safe comes first. This is how lessons are run and what to do if you have a concern."
    >
      <h2>The tutor</h2>
      <ul>
        <li>Holds an enhanced DBS check, the level of check required for working with children.</li>
        <li>Is a qualified teacher, with a PGCE and Qualified Teacher Status (QTS).</li>
        <li>Teaches the lessons personally.</li>
      </ul>

      <h2>Parents and guardians stay involved</h2>
      <ul>
        <li>Only a parent or legal guardian aged 18 or over can create an account and book. Children don&apos;t have accounts.</li>
        <li>
          A parent or guardian must be present for the 15-minute talk that is part of every Assessment Lesson, so you meet the
          tutor and agree the plan together.
        </li>
        <li>
          You give an emergency contact, and can share any medical, allergy or SEN information, on the Parent/Guardian Agreement
          &amp; Consent Form. Only the tutor can see it.
        </li>
        <li>All messages about lessons go to the parent or guardian, not to the student.</li>
      </ul>

      {s.homeVisitsEnabled ? (
        <>
          <h2>Home visits</h2>
          <ul>
            <li>A parent, guardian or another responsible adult must be at home for the whole lesson.</li>
            <li>The lesson takes place in a shared space, such as a kitchen or living room, not a bedroom.</li>
            <li>If no adult is at home when the tutor arrives, the lesson won&apos;t go ahead.</li>
          </ul>
        </>
      ) : null}

      <h2>Group sessions</h2>
      <p>
        Groups have a fixed maximum size and a register of who has booked. Please let us know who will drop off and collect your
        child.
      </p>

      <h2>If there is a concern</h2>
      <p>
        If the tutor is worried that a child may be at risk of harm, they will follow safeguarding guidance and may share
        information with Blackburn with Darwen Children&apos;s Services or the police, as the law allows. Where it is safe to do so,
        we will talk to you first.
      </p>
      <p>
        If you have a concern about your child&apos;s safety or about anything that happened in a lesson, email{" "}
        <a href={`mailto:${FALLBACK_EMAIL}`}>{FALLBACK_EMAIL}</a>. If a child is in immediate danger, call 999. You can also
        contact the NSPCC helpline on 0808 800 5000.
      </p>

      <p>
        See also our <Link href="/terms">Terms of Service</Link> (conduct) and <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPage>
  );
}
