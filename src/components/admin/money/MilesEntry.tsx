"use client";

import { useState } from "react";
import { setMiles } from "@/app/admin/(secure)/money/actions";
import { ActionError, useAdminAction } from "@/components/admin/useAdminAction";
import { Button } from "@/components/ui/Button";

/** Miles input for one trip. */
export function MilesEntry({ id, miles, label }: { id: string; miles: number | null; label: string }) {
  const { run, pending, error } = useAdminAction();
  const [value, setValue] = useState(miles === null ? "" : String(miles));
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setMiles(id, value));
      }}
    >
      <input
        aria-label={`Miles for ${label}`}
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="block w-24 rounded-field border-2 border-navy-400 bg-white px-3 py-2 text-body text-navy-900"
      />
      <Button type="submit" variant="secondary" disabled={pending} aria-label={`Save miles for ${label}`}>
        Save
      </Button>
      <ActionError message={error} />
    </form>
  );
}
