import "server-only";
import { formatPence } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { mapPass, type PassRow } from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";
import type { Pass } from "@/lib/types";
import { businessInbox, siteUrl } from "./config";
import { bankDetails, loadPeople, safely } from "./notifications";
import { sendEmail } from "./send";

type Client = ReturnType<typeof createServiceClient>;

async function loadPass(c: Client, passId: string): Promise<{ pass: Pass; childName: string | null } | null> {
  const { data, error } = await c.from("passes").select("*").eq("id", passId).maybeSingle();
  if (error) throw new Error(`Could not load pass: ${error.message}`);
  if (!data) return null;
  const pass = mapPass(data as PassRow);
  let childName: string | null = null;
  if (pass.childId) {
    const child = await c.from("children").select("first_name").eq("id", pass.childId).maybeSingle();
    childName = (child.data?.first_name as string | undefined) ?? null;
  }
  return { pass, childName };
}

/**
 * After a parent buys a pass: PassConfirmed to the parent (reference, total,
 * bank details) and a notice to the business inbox. Both are idempotent per
 * pass; a failure is logged and never undoes the purchase.
 */
export async function notifyPassBought(passId: string): Promise<void> {
  await safely("pass bought", async () => {
    const c = createServiceClient();
    const found = await loadPass(c, passId);
    if (!found) return;
    const { pass, childName } = found;
    const parent = pass.parentId ? (await loadPeople(c, [pass.parentId])).get(pass.parentId) : undefined;
    const [priv, settings] = await Promise.all([bankDetails(), getSettings()]);

    if (parent) {
      await safely("pass confirmation", () =>
        sendEmail({
          to: parent.email,
          template: "pass_confirmed",
          passId,
          props: {
            parentName: parent.name,
            childName,
            level: pass.level,
            sessions: pass.sessionsTotal,
            totalPence: pass.pricePence,
            reference: pass.paymentReference,
            bank: priv.bank,
            validityMonths: settings.passValidityMonths,
          },
        }),
      );
    }
    await safely("pass admin notice", () =>
      sendEmail({
        to: businessInbox(),
        template: "admin_new_pass",
        passId,
        props: {
          title: "New group pass — awaiting payment",
          lines: [
            `${parent?.name ?? "A parent"}${parent ? ` (${parent.email})` : ""} has bought a ${pass.sessionsTotal}-session ${pass.level} group pass${childName ? ` for ${childName}` : ""}.`,
            `Reference ${pass.paymentReference}, ${formatPence(pass.pricePence)}. Mark it paid in Money once the payment arrives.`,
          ],
          link: { href: `${siteUrl()}/admin/money#passes`, label: "Open Money" },
        },
      }),
    );
  });
}

/** The one awaiting-payment reminder for a pass (the daily cron calls it 48 hours after purchase). Throws on failure. */
export async function sendPassPaymentReminder(passId: string): Promise<"sent" | "skipped"> {
  const c = createServiceClient();
  const found = await loadPass(c, passId);
  if (!found || found.pass.status !== "awaiting_payment" || !found.pass.parentId) return "skipped";
  const { pass } = found;
  const parent = (await loadPeople(c, [pass.parentId])).get(pass.parentId!);
  if (!parent) return "skipped";
  const priv = await bankDetails();
  return sendEmail({
    to: parent.email,
    template: "pass_payment_reminder",
    passId,
    props: {
      parentName: parent.name,
      level: pass.level,
      sessions: pass.sessionsTotal,
      totalPence: pass.pricePence,
      reference: pass.paymentReference,
      bank: priv.bank,
    },
  });
}
