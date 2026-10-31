import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/Button";
import { createServerClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export const metadata: Metadata = { title: "Your account" };

// Placeholder: the full dashboard is built in a later task.
export default async function AccountPage() {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=%2Faccount");
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", auth.user.id).single();
  const name = profile?.full_name || auth.user.email;
  return (
    <div className="mx-auto flex max-w-content flex-col items-start gap-6 px-5 py-12 sm:px-8">
      <h1 className="text-h1">Welcome, {name}</h1>
      <ButtonLink href="/account/children">Your children and agreements</ButtonLink>
      <form action={signOut}>
        <Button type="submit" variant="secondary">
          Sign out
        </Button>
      </form>
    </div>
  );
}
