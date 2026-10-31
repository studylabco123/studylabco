import "server-only";
import type { PrivateSettings, Settings } from "@/lib/types";
import {
  mapPrivateSettings,
  mapSettings,
  privateSettingsPatchToRow,
  settingsPatchToRow,
  type PrivateSettingsRow,
  type SettingsRow,
} from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";

export async function getSettings(): Promise<Settings> {
  const { data, error } = await createServiceClient().from("settings").select("*").eq("id", 1).single();
  if (error) throw new Error(`Could not load settings: ${error.message}`);
  return mapSettings(data as SettingsRow);
}

/** Bank details, teaching address, meeting link and calendar token. Never expose to the browser. */
export async function getPrivateSettings(): Promise<PrivateSettings> {
  const { data, error } = await createServiceClient().from("settings_private").select("*").eq("id", 1).single();
  if (error) throw new Error(`Could not load private settings: ${error.message}`);
  return mapPrivateSettings(data as PrivateSettingsRow);
}

/** Callers (admin actions) must check the admin session before calling. */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const row = settingsPatchToRow(patch);
  if (Object.keys(row).length === 0) return getSettings();
  const { data, error } = await createServiceClient().from("settings").update(row).eq("id", 1).select("*").single();
  if (error) throw new Error(`Could not update settings: ${error.message}`);
  return mapSettings(data as SettingsRow);
}

export async function updatePrivateSettings(patch: Partial<PrivateSettings>): Promise<PrivateSettings> {
  const row = privateSettingsPatchToRow(patch);
  if (Object.keys(row).length === 0) return getPrivateSettings();
  const { data, error } = await createServiceClient()
    .from("settings_private")
    .update(row)
    .eq("id", 1)
    .select("*")
    .single();
  if (error) throw new Error(`Could not update private settings: ${error.message}`);
  return mapPrivateSettings(data as PrivateSettingsRow);
}
