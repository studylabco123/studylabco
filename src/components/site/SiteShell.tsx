import { Footer } from "@/components/site/Footer";
import { Header, type HeaderArea } from "@/components/site/Header";
import { siteContact } from "@/lib/public/data";

/**
 * Skip link, header, main landmark and footer, shared by every page group.
 * Contact details come from settings (ruling R1): the phone is hidden until set.
 */
export async function SiteShell({ children, area = "public" }: Readonly<{ children: React.ReactNode; area?: HeaderArea }>) {
  const contact = await siteContact();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-navy-900 px-5 py-3 font-display font-medium text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to main content
      </a>
      <Header email={contact.email} phone={contact.phone ?? undefined} area={area} />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <Footer email={contact.email} phone={contact.phone ?? undefined} address={contact.address ?? undefined} />
    </div>
  );
}
