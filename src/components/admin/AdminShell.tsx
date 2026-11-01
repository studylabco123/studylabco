import { SiteShell } from "@/components/site/SiteShell";
import { Button } from "@/components/ui/Button";
import { signOut } from "@/app/account/actions";
import { AdminNav } from "./AdminNav";

/** Site shell plus the admin navigation bar and sign-out button. */
export function AdminShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SiteShell area="admin">
      <div className="border-b-2 border-navy-900 bg-sky-100">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <AdminNav />
          <form action={signOut}>
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
        </div>
      </div>
      <div className="mx-auto max-w-content px-5 py-8 sm:px-8">{children}</div>
    </SiteShell>
  );
}
