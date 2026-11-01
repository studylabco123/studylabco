import { formatPence } from "@/lib/format";
import { Steps } from "./Steps";

/** The home page's three steps from first visit to regular lessons. */
export function HowItWorks({ assessmentPence }: { assessmentPence: number }) {
  return (
    <Steps
      label="How it works"
      className="mt-10 md:mt-12"
      steps={[
        {
          title: "Create an account",
          body: <>Add your child and sign the parent/guardian agreement. It takes about five minutes.</>,
        },
        {
          title: `Book the ${formatPence(assessmentPence)} Assessment Lesson`,
          body: (
            <>
              A 60-minute lesson to find out where your child is, including a <strong>15-minute talk with you</strong> about
              goals and next steps.
            </>
          ),
        },
        {
          title: "Book regular lessons",
          body: <>Once your child is approved, choose 1-to-1 lessons or a group, week by week or as a block.</>,
        },
      ]}
    />
  );
}
