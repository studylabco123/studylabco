import { Link } from "@react-email/components";
import { H, Layout, P } from "./parts";

export interface AdminNoticeProps {
  title: string;
  lines: string[];
  link?: { href: string; label: string } | null;
}

/** Internal notice to the business inbox. */
export function AdminNotice({ title, lines, link }: AdminNoticeProps) {
  return (
    <Layout preview={title}>
      <H>{title}</H>
      {lines.map((l, i) => (
        <P key={i}>{l}</P>
      ))}
      {link && (
        <P>
          <Link href={link.href}>{link.label}</Link>
        </P>
      )}
    </Layout>
  );
}
