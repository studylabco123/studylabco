"use client";

import { useState } from "react";
import { regenerateFeedToken } from "@/app/admin/(secure)/settings/actions";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ActionError } from "@/components/admin/useAdminAction";

/** The private calendar feed link, and the way to replace it if it leaks. */
export function FeedLink({ siteUrl, initialToken }: { siteUrl: string; initialToken: string }) {
  const [token, setToken] = useState(initialToken);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const url = `${siteUrl}/api/calendar/${token}`;

  return (
    <div className="flex flex-col gap-3">
      <p>Add this link to your phone or computer calendar as a subscription. Anyone with the link can see your lesson times, so keep it private.</p>
      <p>
        <code data-testid="feed-url" className="block break-all rounded-field bg-sky-50 px-3 py-2 text-small">
          {url}
        </code>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          Copy link
        </Button>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Regenerate link
        </Button>
        {copied ? <span role="status">Copied.</span> : null}
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Regenerate the calendar link?"
        description="The old link stops working straight away. You will need to subscribe again with the new one."
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep current link
            </Button>
            <Button
              disabled={pending}
              onClick={async () => {
                setPending(true);
                setError(undefined);
                const res = await regenerateFeedToken();
                setPending(false);
                if (res.ok) {
                  setToken(res.token);
                  setCopied(false);
                  setOpen(false);
                } else setError(res.message);
              }}
            >
              Yes, regenerate it
            </Button>
          </>
        }
      >
        <ActionError message={error} />
      </Dialog>
    </div>
  );
}
