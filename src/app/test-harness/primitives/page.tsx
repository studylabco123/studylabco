import { notFound } from "next/navigation";
import { PrimitivesHarness } from "./PrimitivesHarness";

// Test-only page for e2e tests of interactive primitives. Not served in production.
export const metadata = { title: "Primitives harness", robots: { index: false } };

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PrimitivesHarness />;
}
