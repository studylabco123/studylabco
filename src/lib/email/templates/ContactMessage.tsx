import { H, Layout, P } from "./parts";

export interface ContactMessageProps {
  name: string;
  email: string;
  phone: string | null;
  message: string;
}

/** A contact-form message, sent to the business inbox. */
export function ContactMessage({ name, email, phone, message }: ContactMessageProps) {
  return (
    <Layout preview={`Message from ${name}`}>
      <H>New message from the contact form</H>
      <P>From: {name}</P>
      <P>Email: {email}</P>
      {phone ? <P>Phone: {phone}</P> : null}
      <P>{message}</P>
    </Layout>
  );
}
