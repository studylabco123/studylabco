import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { DeleteAccount, MarketingForm } from "./SettingsForms";

export const metadata: Metadata = { title: "Account settings" };

export default async function SettingsPage() {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=%2Faccount%2Fsettings");
  const { data: profile } = await supabase.from("profiles").select("marketing_opt_in").eq("id", auth.user.id).single();

  return (
    <div className="mx-auto flex max-w-content flex-col gap-10 px-5 py-12 sm:px-8">
      <div className="flex flex-col gap-2">
        <Link href="/account" className="underline underline-offset-4">
          Back to your account
        </Link>
        <h1 className="text-h1">Account settings</h1>
      </div>
      <section aria-labelledby="marketing" className="flex flex-col gap-4">
        <h2 id="marketing" className="text-h2">
          Emails
        </h2>
        <MarketingForm initial={Boolean(profile?.marketing_opt_in)} />
      </section>
      <section aria-labelledby="delete" className="flex flex-col items-start gap-4">
        <h2 id="delete" className="text-h2">
          Delete your account
        </h2>
        <p>
          You cannot delete your account while you owe money. Once deleted, you will be signed out and your details removed.
        </p>
        <DeleteAccount />
      </section>
    </div>
  );
}
