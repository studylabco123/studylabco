import "server-only";
import { randomBytes } from "node:crypto";
import { updatePrivateSettings, updateSettings } from "@/lib/settings";
import { parseSettingsInput, type SettingsErrors, type SettingsFormInput } from "./settings-validation";
import { fail, type Failure } from "./result";

/** Saves and regenerates settings. The caller has passed requireAdmin(). */

export type SaveSettingsResult = { ok: true } | { ok: false; message: string; errors: SettingsErrors };

export async function saveSettings(input: SettingsFormInput): Promise<SaveSettingsResult> {
  if (!input || typeof input !== "object") return { ok: false, message: "Something was missing. Please refresh and try again.", errors: {} };
  const parsed = parseSettingsInput(input);
  if (!parsed.ok) return { ok: false, message: "Some settings need fixing. They are marked below.", errors: parsed.errors };
  try {
    await updateSettings(parsed.settings);
    await updatePrivateSettings(parsed.priv);
  } catch (err) {
    console.error("admin: save settings failed", err);
    return { ok: false, message: "Something went wrong. Please try again.", errors: {} };
  }
  return { ok: true };
}

export type FeedTokenResult = { ok: true; token: string } | Failure;

/** A new random feed token; the old link stops working at once. */
export async function regenerateFeedToken(): Promise<FeedTokenResult> {
  try {
    const { calendarFeedToken } = await updatePrivateSettings({ calendarFeedToken: randomBytes(24).toString("hex") });
    return { ok: true, token: calendarFeedToken };
  } catch (err) {
    console.error("admin: regenerate feed token failed", err);
    return fail("Something went wrong. Please try again.");
  }
}

