import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { londonDateOf } from "@/lib/time";

/** Every table in the public schema. A database test fails if this list drifts from the schema. */
export const BACKUP_TABLES = [
  "agreements",
  "availability_rules",
  "block_bookings",
  "blocked_rules",
  "blocked_times",
  "bookings",
  "children",
  "consents",
  "email_log",
  "expenses",
  "group_series",
  "group_sessions",
  "ledger",
  "mileage",
  "profiles",
  "settings",
  "settings_private",
  "student_status",
  "term_periods",
  "tutor_notes",
] as const;

const PAGE = 1000;
/** The key that makes paging stable; every table has `created_at`. */
const KEY: Record<string, string> = { student_status: "child_id" };

export interface Backup {
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

/** All rows of all public tables (service client; the caller has passed requireAdmin()). */
export async function buildBackup(now: Date = new Date()): Promise<Backup> {
  const c = createServiceClient();
  const tables: Record<string, unknown[]> = {};
  for (const table of BACKUP_TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await c.from(table).select("*").order("created_at").order(KEY[table] ?? "id").range(from, from + PAGE - 1);
      if (error) throw new Error(`Could not back up ${table}: ${error.message}`);
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    tables[table] = rows;
  }
  return { exportedAt: now.toISOString(), tables };
}

export const backupFilename = (now: Date) => `studylabco-backup-${londonDateOf(now)}.json`;
