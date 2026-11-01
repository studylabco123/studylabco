import { formatPence } from "@/lib/format";
import { Steps } from "./Steps";

/** The home page's three steps from first visit to regular lessons. */
export function HowItWorks({ assessmentPence, ks3AssessmentPence }: { assessmentPence: number; ks3AssessmentPence: number }) {
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
          title: "Book the Assessment Lesson",
          body: (
            <>
              A 60-minute lesson to find out where your child is, including a <strong>15-minute talk with you</strong> about
              goals and next steps. {formatPence(ks3AssessmentPence)} for KS3 (Years 7–8), {formatPence(assessmentPence)} for
              GCSE and every Year 9 student.
            </>
          ),
        },
        {
          title: "Book regular lessons",
          body: <>Once your child is approved, choose 1-to-1 lessons or group sessions one at a time, or save with a group pass.</>,
        },
      ]}
    />
  );
}
