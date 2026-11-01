import { requireAdmin } from "@/lib/admin-guard";
import { loadTaxPack } from "@/lib/admin/money-queries";
import { toPdf } from "@/lib/money/pdf";
import { rangeFor } from "@/lib/money/tax-year";
import { toXlsx } from "@/lib/money/xlsx";

export const dynamic = "force-dynamic";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Tax Year Pack download: ?year=2026-27[&q=1-4]&format=xlsx|pdf. Admin (with 2-step verification) only. */
export async function GET(request: Request) {
  await requireAdmin();
  const params = new URL(request.url).searchParams;
  const q = params.get("q");
  const range = rangeFor(params.get("year") ?? "", q ? Number(q) : null);
  const format = params.get("format");
  if (!range || (format !== "xlsx" && format !== "pdf")) {
    return new Response("Choose a tax year and a format (xlsx or pdf).", { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const pack = await loadTaxPack(range);
  const name = `studylabco-tax-pack-${range.label}${range.q ? `-Q${range.q}` : ""}.${format}`;
  const body = format === "xlsx" ? new Uint8Array(await toXlsx(pack)) : await toPdf(pack);
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": format === "xlsx" ? XLSX : "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
