"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog } from "@/components/ui/Dialog";
import { deleteMyAccount, setMarketingOptIn } from "./actions";

export function MarketingForm({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col items-start gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setMarketingOptIn(on);
          setMessage(res.ok ? { text: "Preference saved.", error: false } : { text: res.message, error: true });
        });
      }}
    >
      <Checkbox
        label="Send me news, offers and revision tips by email"
        description="You can change this at any time. Booking and lesson emails are always sent."
        checked={on}
        onChange={(e) => setOn(e.target.checked)}
      />
      <Button type="submit" disabled={pending}>
        Save preference
      </Button>
      {message ? (
        <p role={message.error ? "alert" : "status"} className={message.error ? "text-danger-700" : undefined}>
          {message.text}
        </p>
      ) : null}
    </form>
  );
}

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="secondary" onClick={() => { setError(undefined); setOpen(true); }}>
        Delete my account
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete your account?"
        description="This permanently removes your details, your children's profiles and signed agreements. We keep an anonymous record of past lessons and payments for our accounts. This cannot be undone."
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep my account
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(undefined);
                  const res = await deleteMyAccount();
                  // On success the action redirects and never returns.
                  if (res && !res.ok) setError(res.message);
                })
              }
            >
              Yes, delete my account
            </Button>
          </>
        }
      >
        {error ? <p role="alert" className="text-danger-700">{error}</p> : null}
      </Dialog>
    </>
  );
}
