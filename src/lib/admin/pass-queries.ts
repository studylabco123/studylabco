import "server-only";
import { passRemaining } from "@/lib/booking/pass";
import { passSeats } from "@/lib/booking/pass-service";
import { mapPass, type PassRow } from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";
import type { Pass } from "@/lib/types";

/** Read side of the admin pass lists (service client; callers must have passed requireAdmin()). */

export interface AdminPassItem {
  pass: Pass;
  parentName: string;
  childName: string;
  remaining: number;
}

/**
 * Passes for the Money page (every pass still awaiting payment or active,
 * plus expired ones, newest first) or, with `parentId`, all of one family's.
 */
export async function loadAdminPasses(opts: { parentId?: string } = {}): Promise<AdminPassItem[]> {
  const c = createServiceClient();
  let q = c.from("passes").select("*").order("created_at", { ascending: false }).limit(100);
  q = opts.parentId ? q.eq("parent_id", opts.parentId) : q.in("status", ["awaiting_payment", "active", "expired"]);
  const res = await q;
  if (res.error) throw new Error(`Could not load passes: ${res.error.message}`);
  const passes = (res.data as PassRow[]).map(mapPass);
  if (!passes.length) return [];

  const parentIds = [...new Set(passes.map((p) => p.parentId).filter((x): x is string => !!x))];
  const childIds = [...new Set(passes.map((p) => p.childId).filter((x): x is string => !!x))];
  const [profiles, children, seats] = await Promise.all([
    parentIds.length ? c.from("profiles").select("id, full_name, email").in("id", parentIds) : { data: [], error: null },
    childIds.length ? c.from("children").select("id, first_name, last_name").in("id", childIds) : { data: [], error: null },
    passSeats(passes.map((p) => p.id)),
  ]);
  if (profiles.error) throw new Error(`Could not load profiles: ${profiles.error.message}`);
  if (children.error) throw new Error(`Could not load children: ${children.error.message}`);
  const names = new Map((profiles.data as { id: string; full_name: string; email: string }[]).map((p) => [p.id, p.full_name?.trim() || p.email]));
  const kids = new Map((children.data as { id: string; first_name: string; last_name: string }[]).map((k) => [k.id, `${k.first_name} ${k.last_name}`]));
  return passes.map((pass) => ({
    pass,
    parentName: (pass.parentId && names.get(pass.parentId)) || "Unknown parent",
    childName: (pass.childId && kids.get(pass.childId)) || "Unknown child",
    remaining: passRemaining(pass, seats),
  }));
}
