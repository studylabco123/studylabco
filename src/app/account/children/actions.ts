"use server";

import { redirect } from "next/navigation";
import { childSchema } from "@/lib/children/validation";
import { createServerClient } from "@/lib/supabase/server";

export type ChildField = "first_name" | "last_name" | "school_year" | "exam_board" | "tier" | "subjects" | "target_grade";

export interface ChildState {
  errors?: Partial<Record<ChildField, string>>;
  formError?: string;
  values?: {
    first_name: string;
    last_name: string;
    school_year: string;
    exam_board: string;
    tier: string;
    subjects: string[];
    target_grade: string;
  };
}

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function addChild(_prev: ChildState, formData: FormData): Promise<ChildState> {
  const subjects = formData.getAll("subjects").filter((v): v is string => typeof v === "string");
  const values = {
    first_name: text(formData, "first_name"),
    last_name: text(formData, "last_name"),
    school_year: text(formData, "school_year"),
    exam_board: text(formData, "exam_board"),
    tier: text(formData, "tier"),
    subjects,
    target_grade: text(formData, "target_grade"),
  };
  const parsed = childSchema.safeParse(values);
  if (!parsed.success) {
    const errors: ChildState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as ChildField;
      errors[field] ??= issue.message;
    }
    return { errors, values };
  }

  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=%2Faccount%2Fchildren");

  // RLS (parent_all_own) also enforces that parent_id is the signed-in user.
  const { error } = await supabase.from("children").insert({ parent_id: auth.user.id, ...parsed.data });
  if (error) {
    console.error("addChild failed", error);
    return { formError: "We could not save your child's details. Please try again.", values };
  }
  redirect("/account/children");
}
