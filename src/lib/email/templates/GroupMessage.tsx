import { H, Layout, P } from "./parts";

export interface GroupMessageProps {
  parentName: string;
  subject: string;
  message: string;
}

/** A note from the tutor to the families booked on one group session. */
export function GroupMessage({ parentName, subject, message }: GroupMessageProps) {
  const paragraphs = message.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  return (
    <Layout preview={subject}>
      <H>{subject}</H>
      <P>{`Hi ${parentName},`}</P>
      {paragraphs.map((p, i) => (
        <P key={i}>{p}</P>
      ))}
    </Layout>
  );
}
