"use client";

import { Button } from "@/components/ui/Button";
import { closeDay, reopenDay, unblock } from "@/app/admin/(secure)/calendar/actions";
import { ActionError, useAdminAction } from "@/components/admin/useAdminAction";

/** Close or reopen a whole day. */
export function DayToggle({ date, closed, label }: { date: string; closed: boolean; label: string }) {
  const { run, pending, error } = useAdminAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        disabled={pending}
        aria-label={`${closed ? "Reopen this day" : "Close this day"}, ${label}`}
        onClick={() => run(() => (closed ? reopenDay(date) : closeDay(date)))}
      >
        {closed ? "Reopen this day" : "Close this day"}
      </Button>
      <ActionError message={error} />
    </div>
  );
}

/** Remove a one-off or repeating block. */
export function RemoveBlock({ id, label }: { id: string; label: string }) {
  const { run, pending, error } = useAdminAction();
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button variant="quiet" disabled={pending} aria-label={`Remove block, ${label}`} onClick={() => run(() => unblock(id))}>
        Remove block
      </Button>
      <ActionError message={error} />
    </span>
  );
}
