"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Reveal } from "@/components/ui/Reveal";
import { useToast } from "@/components/ui/Toast";

export function PrimitivesHarness() {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <h1 className="text-h1">Primitives harness</h1>
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      <Button variant="secondary" onClick={() => toast({ title: "Booking saved", tone: "success" })}>
        Show toast
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel this lesson?"
        description="A late cancellation fee applies."
        actions={<Button onClick={() => setOpen(false)}>Keep lesson</Button>}
      />
      {/* Pushes the reveal target well below the fold. */}
      <div aria-hidden="true" className="h-[150vh]" />
      <Reveal>
        <p id="reveal-target">Revealed on scroll</p>
      </Reveal>
    </main>
  );
}
