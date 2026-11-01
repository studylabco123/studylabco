import { Text } from "@react-email/components";
import { H, Layout, P } from "./parts";

export interface ContactMessageProps {
  name: string;
  email: string;
  phone: string | null;
  message: string;
}

/** A contact-form message, sent to the business inbox. Replies go to the sender. */
export function ContactMessage({ name, email, phone, message }: ContactMessageProps) {
  return (
    <Layout preview={`Message from ${name}`}>
      <H>New message from the contact form</H>
      <P>From: {name}</P>
      <P>Email: {email}</P>
      {phone ? <P>Phone: {phone}</P> : null}
      <Text style={{ color: "#001A42", fontSize: "16px", lineHeight: "24px", margin: "0 0 14px", whiteSpace: "pre-wrap" }}>
        {message}
      </Text>
      <P muted>Reply to this email to answer {name} directly.</P>
    </Layout>
  );
}
