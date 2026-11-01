import { H, Layout, P } from "./parts";
import { Link } from "@react-email/components";

export interface ResultsPublishedProps {
  parentName: string;
  childName: string;
  /** Absolute link to the child's results page. Scores and feedback are never put in the email. */
  link: string;
}

/** Tells a parent new results are ready to read in their account. */
export function ResultsPublished({ parentName, childName, link }: ResultsPublishedProps) {
  return (
    <Layout preview={`New results for ${childName}`}>
      <H>{`New results for ${childName}`}</H>
      <P>{`Hi ${parentName},`}</P>
      <P>{`We have added new results and feedback for ${childName}. Log in to your account to read them.`}</P>
      <P>
        <Link href={link} style={{ color: "#001A42", fontWeight: 700 }}>
          {`View ${childName}'s results`}
        </Link>
      </P>
    </Layout>
  );
}
