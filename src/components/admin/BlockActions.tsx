"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { markBlockPaid, releaseBlock } from "@/app/admin/(secure)/bookings/actions";
import { ActionError, useAdminAction } from "./useAdminAction";

/** Pay or release a held block. */
export function BlockActions({ blockId, label }: { blockId: string; label: string }) {
  const { run, pending, error } = useAdminAction();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={pending} aria-label={`Mark block paid (bank transfer) for ${label}`} onClick={() => run(() => markBlockPaid(blockId, "bank_transfer"))}>
        Mark block paid (bank transfer)
      </Button>
      <Button variant="secondary" disabled={pending} aria-label={`Mark block paid (cash) for ${label}`} onClick={() => run(() => markBlockPaid(blockId, "cash"))}>
        Mark block paid (cash)
      </Button>
      <Button variant="secondary" disabled={pending} aria-label={`Release block for ${label}`} onClick={() => setOpen(true)}>
        Release block
      </Button>
      <ActionError message={open ? undefined : error} />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Release this block?"
        description="Its future sessions are cancelled and the seats are freed. Nothing is charged."
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep block
            </Button>
            <Button disabled={pending} onClick={() => run(() => releaseBlock(blockId), () => setOpen(false))}>
              Yes, release it
            </Button>
          </>
        }
      >
        <ActionError message={error} />
      </Dialog>
    </div>
  );
}
