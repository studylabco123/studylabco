"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { regenerateFeedToken as regenerate, saveSettings as save, type FeedTokenResult, type SaveSettingsResult } from "@/lib/admin/settings-ops";
import type { SettingsFormInput } from "@/lib/admin/settings-validation";

/** Settings actions. Each one calls requireAdmin() first (a layout guard does not protect a server action). */

export async function saveSettings(input: SettingsFormInput): Promise<SaveSettingsResult> {
  await requireAdmin();
  const res = await save(input);
  // Prices and toggles change what parents can book, so refresh everything.
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function regenerateFeedToken(): Promise<FeedTokenResult> {
  await requireAdmin();
  const res = await regenerate();
  if (res.ok) revalidatePath("/admin/settings");
  return res;
}
