"use server";

import { redirect } from "next/navigation";
import { childLevelSchema, childSchema } from "@/lib/children/validation";
import { createServerClient } from "@/lib/supabase/server";

export type ChildField =
  | "first_name"
  | "last_name"
  | "school_year"
  | "level"
  | "exam_board"
  | "tier"
  | "subjects"
  | "target_grade";

export interface ChildState {
  errors?: Partial<Record<ChildField, string>>;
  formError?: string;
  values?: {
    first_name: string;
    last_name: string;
    school_year: string;
    level: string;
    exam_board: string;
    tier: string;
    subjects: string[];
    target_grade: string;
  };
}

type LevelField = "school_year" | "level" | "exam_board" | "tier";

export interface LevelState {
  errors?: Partial<Record<LevelField, string>>;
  formError?: string;
  values?: Record<LevelField, string>;
}

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function levelValues(formData: FormData): Record<LevelField, string> {
  return {
    school_year: text(formData, "school_year"),
    level: text(formData, "level"),
    exam_board: text(formData, "exam_board"),
    tier: text(formData, "tier"),
  };
}

function collect<F extends string>(issues: { path: PropertyKey[]; message: string }[], into: Partial<Record<F, string>>) {
  for (const issue of issues) into[issue.path[0] as F] ??= issue.message;
}

export async function addChild(_prev: ChildState, formData: FormData): Promise<ChildState> {
  const subjects = formData.getAll("subjects").filter((v): v is string => typeof v === "string");
  const values = {
    first_name: text(formData, "first_name"),
    last_name: text(formData, "last_name"),
    ...levelValues(formData),
    subjects,
    target_grade: text(formData, "target_grade"),
  };
  const parsed = childSchema.safeParse(values);
  if (!parsed.success) {
    const errors: ChildState["errors"] = {};
    collect(parsed.error.issues, errors);
    // The level checks only run once the other fields pass, so add them here to show every problem at once.
    const level = childLevelSchema.safeParse(values);
    if (!level.success) collect(level.error.issues, errors);
    return { errors, values };
  }

  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=%2Faccount%2Fchildren");

  // RLS (parent_insert_own) also enforces that parent_id is the signed-in user.
  const { error } = await supabase.from("children").insert({ parent_id: auth.user.id, ...parsed.data });
  if (error) {
    console.error("addChild failed", error);
    return { formError: "We could not save your child's details. Please try again.", values };
  }
  redirect("/account/children");
}

/**
 * "Change level": school year, KS3/GCSE and (for GCSE) exam board and tier.
 * Only the child row changes: existing bookings keep their level and price,
 * and new bookings follow the new level.
 */
export async function changeLevel(childId: string, _prev: LevelState, formData: FormData): Promise<LevelState> {
  const values = levelValues(formData);
  const parsed = childLevelSchema.safeParse(values);
  if (!parsed.success) {
    const errors: LevelState["errors"] = {};
    collect(parsed.error.issues, errors);
    return { errors, values };
  }

  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(`/account/children/${childId}/level`)}`);

  // RLS (parent_update_own) limits this to the signed-in parent's own children.
  const { data, error } = await supabase
    .from("children")
    .update(parsed.data)
    .eq("id", childId)
    .eq("parent_id", auth.user.id)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error("changeLevel failed", error);
    return { formError: "We could not save the change. Please try again.", values };
  }
  redirect("/account/children");
}
