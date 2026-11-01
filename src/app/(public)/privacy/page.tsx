import Link from "next/link";
import { LegalPage } from "@/components/site/LegalPage";
import { pageMetadata } from "@/lib/public/meta";
import { FALLBACK_EMAIL } from "@/lib/site";

export const metadata = pageMetadata(
  "Privacy Policy",
  "How Study Lab Co collects, uses, stores and protects information about parents and students under UK GDPR, and how to use your rights.",
  "/privacy",
);

const mail = <a href={`mailto:${FALLBACK_EMAIL}`}>{FALLBACK_EMAIL}</a>;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      path="/privacy"
      intro="What information we collect about you and your child, why, how long we keep it, and your rights under UK data protection law."
    >
      <h2>Who is responsible for your information</h2>
      <p>
        Study Lab Co, a sole trader based in Blackburn, Lancashire, is the &ldquo;controller&rdquo; of the personal information
        described here. For any privacy question or request, email {mail}.
      </p>

      <h2>What we collect</h2>
      <h3>About you, the parent or guardian</h3>
      <ul>
        <li>Your name, email address and phone number.</li>
        <li>Your home address and postcode, only if you book a home visit.</li>
        <li>Your password, stored only in scrambled (hashed) form by our login provider. We can&apos;t see it.</li>
        <li>
          The choices you make when signing up (that you are 18 or over and the parent or guardian, that you agree to the terms,
          and whether you want news and offers), each saved with the date, time and policy version.
        </li>
      </ul>
      <h3>About your child</h3>
      <ul>
        <li>First and last name, school year, exam board, tier, subjects and target grade (optional).</li>
        <li>Notes about special educational needs, exam access arrangements or medical needs, only if you choose to give them.</li>
      </ul>
      <h3>From the Parent/Guardian Agreement &amp; Consent Form</h3>
      <ul>
        <li>An emergency contact name and phone number.</li>
        <li>Medical or allergy information and SEN needs (both optional).</li>
        <li>Your agreement, consent to contact, typed signature and the date and time you signed.</li>
      </ul>
      <h3>Bookings and payments</h3>
      <ul>
        <li>Lessons booked, attended, cancelled or missed, and any cooling-off acknowledgement.</li>
        <li>Payment references, amounts, payment method (bank transfer or cash), refunds, credit and waived fees.</li>
        <li>A record of the emails we send you (which email, when and to which address).</li>
        <li>Private notes the tutor keeps to run lessons and the business.</li>
      </ul>
      <h3>When you contact us</h3>
      <p>
        Contact form messages are emailed to us and are not stored on this website. We keep them in our email inbox for as long
        as we need them to deal with your question.
      </p>

      <h2>Why we use it, and our lawful basis</h2>
      <dl>
        <dt>To provide lessons you book (contract)</dt>
        <dd>
          Running your account, taking bookings, planning lessons, sending confirmations and reminders, and taking payment.
        </dd>
        <dt>To keep financial records (legal obligation)</dt>
        <dd>HMRC requires us to keep records of income, refunds and expenses.</dd>
        <dt>To keep students safe and run the business properly (legitimate interests)</dt>
        <dd>
          Emergency contacts, notes needed to teach safely, records of attendance and late cancellations, protecting the site
          from abuse, and dealing with complaints. We only do this where it doesn&apos;t override your or your child&apos;s
          interests.
        </dd>
        <dt>Medical, allergy and SEN information (explicit consent)</dt>
        <dd>
          This is sensitive (&ldquo;special category&rdquo;) information. We only hold it if you give it on the agreement form,
          which records your explicit consent. You can remove it or withdraw consent at any time.
        </dd>
        <dt>News and offers (consent)</dt>
        <dd>
          Only if you ticked the box. Every marketing email has an unsubscribe link, and you can opt out in your account at any
          time.
        </dd>
        <dt>To protect a child (legal obligation or vital interests)</dt>
        <dd>
          If we believe a child is at risk, we may share information with the right authorities, as safeguarding guidance
          requires.
        </dd>
      </dl>

      <h2>Who we share it with</h2>
      <p>We never sell your information or share it for advertising. We use these service providers to run the website:</p>
      <ul>
        <li>
          <strong>Supabase</strong>: our database, login system and file storage, hosted in the EU (Ireland) region.
        </li>
        <li>
          <strong>Vercel</strong>: hosts the website and processes requests to it.
        </li>
        <li>
          <strong>Resend</strong>: sends our emails, from the EU region.
        </li>
        <li>
          <strong>Cloudflare Turnstile</strong>: checks that forms are filled in by people rather than bots. It looks at technical
          information about your browser and connection for this purpose only.
        </li>
      </ul>
      <p>
        Each provider only uses the information to provide its service to us, under a data processing agreement. Some are based
        in, or use staff or systems in, other countries such as the US. Where information leaves the UK, it is protected by the
        safeguards UK law requires, such as adequacy regulations or approved contract terms.
      </p>
      <p>We may also share information where the law requires it, for example with HMRC.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          <strong>Your account and your child&apos;s profile</strong>: until you delete your account.
        </li>
        <li>
          <strong>Agreement forms</strong>: while your child is a student, and for a reasonable period afterwards in case a
          question or concern comes up, unless you delete your account sooner.
        </li>
        <li>
          <strong>Financial records</strong> (payments, refunds and waived fees): 6 years, as HMRC requires. When you delete your
          account these are kept in anonymised form, without your name or contact details.
        </li>
        <li>
          <strong>Marketing consent</strong>: until you opt out.
        </li>
      </ul>

      <h2>Your rights</h2>
      <p>Under UK GDPR you have the right to:</p>
      <ul>
        <li>ask for a copy of the information we hold about you and your child;</li>
        <li>ask us to correct anything that is wrong or incomplete;</li>
        <li>ask us to delete your information;</li>
        <li>ask us to limit how we use it, or object to us using it;</li>
        <li>ask for your information in a format you can take elsewhere;</li>
        <li>withdraw consent at any time, where we rely on consent.</li>
      </ul>
      <p>
        Email {mail} to use any of these rights. We will reply within one month. There is normally no charge.
      </p>

      <h2>Deleting your account</h2>
      <p>
        You can delete your account yourself in <Link href="/account/settings">your account settings</Link> using
        &ldquo;Delete my account&rdquo;. This erases your personal details and your children&apos;s details. Financial records
        are kept for 6 years in anonymised form, as explained above.
      </p>

      <h2>Keeping it safe</h2>
      <p>
        Information is sent over encrypted connections and access is restricted: only the tutor can see children&apos;s notes and
        agreement forms, and the admin area needs a password and a second verification step. Bank details and the lesson address
        are only shown to parents with a booking.
      </p>

      <h2>Children</h2>
      <p>
        Only parents and guardians aged 18 or over can have an account. Children do not use the website and we do not collect
        information from them directly.
      </p>

      <h2>Cookies</h2>
      <p>
        We only use essential cookies. See our <Link href="/cookies">Cookie Policy</Link>.
      </p>

      <h2>Complaints</h2>
      <p>
        If you are unhappy with how we have handled your information, please tell us first at {mail}. You also have the right to
        complain to the Information Commissioner&apos;s Office (ICO), the UK regulator, at{" "}
        <a href="https://ico.org.uk/make-a-complaint/">ico.org.uk</a> or on 0303 123 1113.
      </p>

      <h2>Changes to this policy</h2>
      <p>If we change how we use your information, we will update this page and tell you about important changes by email.</p>
    </LegalPage>
  );
}
