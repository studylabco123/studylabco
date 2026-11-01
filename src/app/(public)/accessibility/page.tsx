import { LegalPage } from "@/components/site/LegalPage";
import { pageMetadata } from "@/lib/public/meta";
import { FALLBACK_EMAIL } from "@/lib/site";

export const metadata = pageMetadata(
  "Accessibility statement",
  "Study Lab Co aims to meet WCAG 2.2 level AA. What we've done to make the website accessible, and how to tell us about a problem.",
  "/accessibility",
);

export default function AccessibilityPage() {
  return (
    <LegalPage
      title="Accessibility statement"
      path="/accessibility"
      intro="We want everyone to be able to find information, create an account and book lessons on this website."
    >
      <h2>Our aim</h2>
      <p>
        We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. We check pages with automated
        accessibility tests every time the website changes, and test the main journeys (signing up, booking and contacting us) using only a keyboard.
      </p>

      <h2>What we&apos;ve done</h2>
      <ul>
        <li>Every page and form, including booking and cancelling, can be used with a keyboard alone, with a visible focus outline.</li>
        <li>A &ldquo;Skip to main content&rdquo; link at the top of every page.</li>
        <li>Text colours meet WCAG AA contrast, and colour is never the only way information is shown.</li>
        <li>Fonts chosen for readability (Atkinson Hyperlegible for body text), with body text no smaller than 16px.</li>
        <li>Pages reflow to fit phone screens, so you don&apos;t need to scroll sideways to read them.</li>
        <li>Form fields have visible labels, and errors explain what to fix next to the field they relate to.</li>
        <li>Animations are switched off if your device is set to reduce motion.</li>
        <li>Decorative drawings are hidden from screen readers; meaningful images have text alternatives.</li>
      </ul>

      <h2>Known issues</h2>
      <p>
        The security check on some forms (Cloudflare Turnstile) is provided by a third party. It is designed to be accessible,
        but if it stops you from continuing, please contact us and we will help you book another way.
      </p>

      <h2>Tell us about a problem</h2>
      <p>
        If something on this website is hard to use, or you need information in a different format, email{" "}
        <a href={`mailto:${FALLBACK_EMAIL}`}>{FALLBACK_EMAIL}</a>. Tell us the page and what happened, and we will reply within
        five working days.
      </p>
    </LegalPage>
  );
}
