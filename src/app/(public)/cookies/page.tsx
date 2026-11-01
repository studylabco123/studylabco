import Link from "next/link";
import { LegalPage } from "@/components/site/LegalPage";
import { pageMetadata } from "@/lib/public/meta";

export const metadata = pageMetadata(
  "Cookie Policy",
  "Study Lab Co uses only the essential cookies needed to keep you logged in. No analytics, advertising or tracking cookies.",
  "/cookies",
);

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      path="/cookies"
      intro="This website uses only the cookies it needs to work. There are no analytics, advertising or tracking cookies."
    >
      <h2>What cookies we use</h2>
      <p>
        When you log in, we store a small cookie that keeps you signed in as you move between pages, and refreshes your
        session securely. It is set by our login system (Supabase), contains no advertising information, and is removed when
        you log out or it expires.
      </p>
      <p>
        On forms such as sign-up, log-in and contact, Cloudflare Turnstile checks that you are a person and not an automated
        program. It is used only for security.
      </p>

      <h2>Why there is no cookie banner</h2>
      <p>
        UK law (the Privacy and Electronic Communications Regulations) lets websites use cookies that are strictly necessary
        for a service you ask for, such as staying logged in, without asking for consent. Because those are the only cookies
        we use, we don&apos;t show a cookie banner. If we ever add other cookies, we will ask for your consent first and update
        this page.
      </p>

      <h2>Fonts and other content</h2>
      <p>Our fonts and images are served from this website, so loading a page doesn&apos;t send your details to font or image providers.</p>

      <h2>Controlling cookies</h2>
      <p>
        You can delete or block cookies in your browser settings. If you block the login cookie, you won&apos;t be able to log in
        to your account.
      </p>

      <p>
        For more about how we use personal information, see our <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPage>
  );
}
