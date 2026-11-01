import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-guard";

export const metadata: Metadata = { title: "Today" };

export default async function AdminTodayPage() {
  await requireAdmin();
  return <h1 className="text-h1">Today</h1>;
}
