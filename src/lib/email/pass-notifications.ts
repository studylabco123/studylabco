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
            passMinNoticeDays: settings.passMinNoticeDays,
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

/** A parent cancelled their pass (`creditPence` null when the credit could not be saved): tell the business inbox (idempotent per pass; a failure is logged only). */
export async function notifyPassCancelled(passId: string, creditPence: number | null): Promise<void> {
  await safely("pass cancelled notice", async () => {
    const c = createServiceClient();
    const found = await loadPass(c, passId);
    if (!found) return;
    const { pass, childName } = found;
    const parent = pass.parentId ? (await loadPeople(c, [pass.parentId])).get(pass.parentId) : undefined;
    await sendEmail({
      to: businessInbox(),
      template: "admin_pass_cancelled",
      passId,
      props: {
        title: "Group pass cancelled",
        lines: [
          `${parent?.name ?? "A parent"}${parent ? ` (${parent.email})` : ""} has cancelled their ${pass.sessionsTotal}-session ${pass.level} group pass${childName ? ` for ${childName}` : ""}.`,
          `Reference ${pass.paymentReference}, ${formatPence(pass.pricePence)}. ${
            !pass.paidAt
              ? "It had not been paid, so nothing is owed."
              : creditPence === null
                ? "The unused value could not be saved as credit; you have been sent a separate email with the amount."
                : creditPence > 0
                  ? `${formatPence(creditPence)} of unused value was added as account credit.`
                  : "There was no unused value to credit."
          }`,
        ],
        link: { href: `${siteUrl()}/admin/money#passes`, label: "Open Money" },
      },
    });
  });
}

/** The credit for a cancelled pass could not be saved: email the business the amount so they can add it by hand. */
export async function notifyPassCreditFailed(passId: string, creditPence: number): Promise<void> {
  await safely("pass credit failed notice", async () => {
    const c = createServiceClient();
    const found = await loadPass(c, passId);
    if (!found) return;
    const { pass } = found;
    const parent = pass.parentId ? (await loadPeople(c, [pass.parentId])).get(pass.parentId) : undefined;
    await sendEmail({
      to: businessInbox(),
      template: "admin_pass_credit_failed",
      passId,
      props: {
        title: "Pass cancelled: credit not saved",
        lines: [
          `${parent?.name ?? "A parent"}${parent ? ` (${parent.email})` : ""}'s group pass ${pass.paymentReference} was cancelled but its ${formatPence(creditPence)} credit could not be saved.`,
          `Please add ${formatPence(creditPence)} of credit to their account by hand (Families, Add credit).`,
        ],
        link: pass.parentId ? { href: `${siteUrl()}/admin/families/${pass.parentId}`, label: "Open the family" } : null,
      },
    });
  });
}
