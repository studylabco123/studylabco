import { ContactForm } from "@/components/site/ContactForm";
import { PageIntro } from "@/components/site/PageIntro";
import { buttonClasses } from "@/components/ui/Button";
import { siteContact } from "@/lib/public/data";
import { pageMetadata } from "@/lib/public/meta";
import { SITE_NAME, telHref, whatsappHref } from "@/lib/site";

export const metadata = pageMetadata(
  "Contact",
  "Send Study Lab Co a message about GCSE Science lessons in Blackburn, or email directly. Replies usually within one working day.",
  "/contact",
);

export default async function ContactPage() {
  const contact = await siteContact();
  return (
    <>
      <PageIntro title="Contact">
        <p>Questions about lessons, times or prices? Send a message and you&apos;ll get a reply, usually within one working day.</p>
      </PageIntro>
      <div className="mx-auto grid max-w-content gap-12 px-5 py-12 sm:px-8 md:grid-cols-12 md:py-16">
        <section aria-labelledby="message-title" className="md:col-span-7">
          <h2 id="message-title" className="text-h2">
            Send a message
          </h2>
          <p className="mt-2 mb-6 text-small text-navy-600">
            Your message is emailed to {SITE_NAME} and is not stored on this website. We use your details only to reply.
          </p>
          <ContactForm />
        </section>
        <aside aria-labelledby="details-title" className="md:col-span-5">
          <div className="flex flex-col gap-5 rounded-card bg-sky-100 p-6 sm:p-8">
            <h2 id="details-title" className="text-h3">
              Other ways to get in touch
            </h2>
            <div className="flex flex-col gap-3">
              <a href={`mailto:${contact.email}`} className={buttonClasses({ variant: "secondary", className: "w-full" })}>
                Email {contact.email}
              </a>
              {contact.phone ? (
                <>
                  <a href={telHref(contact.phone)} className={buttonClasses({ variant: "secondary", className: "w-full" })}>
                    Call {contact.phone}
                  </a>
                  <a
                    href={whatsappHref(contact.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClasses({ variant: "secondary", className: "w-full" })}
                  >
                    WhatsApp<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </>
              ) : null}
            </div>
            <dl className="flex flex-col gap-3 border-t border-sky-200 pt-5 text-small">
              <div>
                <dt className="font-display font-semibold">Business</dt>
                <dd>{SITE_NAME}, GCSE Science tuition (sole trader)</dd>
              </div>
              <div>
                <dt className="font-display font-semibold">Area</dt>
                <dd>Blackburn, Lancashire</dd>
              </div>
              {contact.address ? (
                <div>
                  <dt className="font-display font-semibold">Business address</dt>
                  <dd className="whitespace-pre-line">{contact.address}</dd>
                </div>
              ) : null}
            </dl>
            <p className="text-fine text-navy-600">
              The lesson address is sent in your booking confirmation. Please don&apos;t visit without a booking.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
