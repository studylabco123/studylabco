import { notFound } from "next/navigation";
import { PrimitivesHarness } from "./PrimitivesHarness";

// Test-only page for e2e tests of interactive primitives. Served only when E2E_HARNESS=1
// (set by the Playwright webServer), so it is a 404 in any real deployment.
export const dynamic = "force-dynamic";
export const metadata = { title: "Primitives harness", robots: { index: false } };

export default function Page() {
  if (process.env.E2E_HARNESS !== "1") notFound();
  return <PrimitivesHarness />;
}
