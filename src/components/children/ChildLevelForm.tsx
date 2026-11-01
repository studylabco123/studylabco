"use client";

import Link from "next/link";
import { useActionState } from "react";
import { changeLevel, type LevelState } from "@/app/account/children/actions";
import { FormError } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { LevelFields, type LevelValues } from "./LevelFields";

export function ChildLevelForm({ childId, current }: { childId: string; current: LevelValues }) {
  const [state, action, pending] = useActionState<LevelState, FormData>(changeLevel.bind(null, childId), {});
  return (
    <form action={action} noValidate className="flex max-w-xl flex-col gap-5">
      {state.formError ? <FormError>{state.formError}</FormError> : null}
      <LevelFields initial={state.values ?? current} errors={state.errors ?? {}} />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save level"}
        </Button>
        <Link href="/account/children" className="underline underline-offset-4 hover:text-navy-600">
          Cancel
        </Link>
      </div>
    </form>
  );
}
