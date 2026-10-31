import type { Metadata } from "next";
import { ChildForm } from "@/components/children/ChildForm";

export const metadata: Metadata = { title: "Add a child" };

export default function NewChildPage() {
  return (
    <div className="mx-auto flex max-w-content flex-col gap-6 px-5 py-12 sm:px-8">
      <h1 className="text-h1">Add a child</h1>
      <ChildForm />
    </div>
  );
}
