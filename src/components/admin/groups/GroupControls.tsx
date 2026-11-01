"use client";

import { useId, useState } from "react";
import { cancelSession, emailGroup, endSeries, updateSeries, updateSession } from "@/app/admin/(secure)/groups/actions";
import { ActionError, useAdminAction } from "@/components/admin/useAdminAction";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog } from "@/components/ui/Dialog";
import { Field, TextareaField } from "@/components/ui/Field";

export interface EditValues {
  title: string;
  capacity: number;
  price: string;
  venue: string;
  isOnline: boolean;
}

function EditDialog({
  open,
  onClose,
  heading,
  description,
  initial,
  save,
}: {
  open: boolean;
  onClose: () => void;
  heading: string;
  description: string;
  initial: EditValues;
  save: (v: EditValues) => ReturnType<typeof updateSeries>;
}) {
  const { run, pending, error } = useAdminAction();
  const formId = useId();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={heading}
      description={description}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            Save changes
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(
            () =>
              save({
                title: String(f.get("title")),
                capacity: Number(f.get("capacity")),
                price: String(f.get("price")),
                venue: String(f.get("venue")),
                isOnline: f.get("isOnline") === "on",
              }),
            onClose,
          );
        }}
      >
        <Field label="Title" name="title" required maxLength={120} defaultValue={initial.title} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Seats" name="capacity" type="number" inputMode="numeric" min={1} max={100} required defaultValue={initial.capacity} />
          <Field label="Price (£)" name="price" inputMode="decimal" required defaultValue={initial.price} />
        </div>
        <Field label="Venue" name="venue" maxLength={300} defaultValue={initial.venue} />
        <Checkbox label="Online" name="isOnline" defaultChecked={initial.isOnline} />
        <ActionError message={error} />
      </form>
    </Dialog>
  );
}

/** Edit or end a weekly group. */
export function SeriesControls({ id, label, initial, active }: { id: string; label: string; initial: EditValues; active: boolean }) {
  const [dialog, setDialog] = useState<"edit" | "end" | null>(null);
  const end = useAdminAction();
  const [outcome, setOutcome] = useState<string>();
  const close = () => setDialog(null);
  if (!active) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" aria-label={`Edit group, ${label}`} onClick={() => setDialog("edit")}>
        Edit group
      </Button>
      <Button variant="secondary" aria-label={`End this group, ${label}`} onClick={() => setDialog("end")}>
        End this group
      </Button>
      {outcome ? <p role="status">{outcome}</p> : null}
      <EditDialog
        key={dialog === "edit" ? "open" : "closed"}
        open={dialog === "edit"}
        onClose={close}
        heading={`Edit ${label}`}
        description="Changes also apply to its future sessions. Seats cannot go below what is already booked."
        initial={initial}
        save={(v) => updateSeries(id, v)}
      />
      <Dialog
        open={dialog === "end"}
        onClose={close}
        title="End this group?"
        description="No more sessions are created. Future sessions nobody has booked are removed. Sessions with bookings stay, and you cancel those one by one so families are told."
        actions={
          <>
            <Button variant="secondary" onClick={close}>
              Keep group
            </Button>
            <Button
              disabled={end.pending}
              onClick={() =>
                end.run(async () => {
                  const res = await endSeries(id);
                  if (res.ok) {
                    setOutcome(
                      res.kept
                        ? `Group ended. ${res.kept} ${res.kept === 1 ? "session still has" : "sessions still have"} bookings: cancel ${res.kept === 1 ? "it" : "them"} below.`
                        : "Group ended.",
                    );
                    close();
                  }
                  return res;
                })
              }
            >
              Yes, end it
            </Button>
          </>
        }
      >
        <ActionError message={end.error} />
      </Dialog>
    </div>
  );
}

/** Edit, email or cancel one session. */
export function SessionControls({ id, label, initial, booked }: { id: string; label: string; initial: EditValues; booked: number }) {
  const [dialog, setDialog] = useState<"edit" | "email" | "cancel" | null>(null);
  const cancel = useAdminAction();
  const mail = useAdminAction();
  const [sent, setSent] = useState<string>();
  const mailFormId = useId();
  const close = () => setDialog(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" aria-label={`Edit, ${label}`} onClick={() => setDialog("edit")}>
        Edit
      </Button>
      <Button variant="secondary" disabled={booked === 0} aria-label={`Email families, ${label}`} onClick={() => setDialog("email")}>
        Email families
      </Button>
      <Button variant="secondary" aria-label={`Cancel session, ${label}`} onClick={() => setDialog("cancel")}>
        Cancel session
      </Button>
      {sent ? <p role="status">{sent}</p> : null}

      <EditDialog
        key={dialog === "edit" ? "open" : "closed"}
        open={dialog === "edit"}
        onClose={close}
        heading={`Edit ${label}`}
        description="Only this session changes. Seats cannot go below what is already booked."
        initial={initial}
        save={(v) => updateSession(id, v)}
      />

      <Dialog
        open={dialog === "email"}
        onClose={close}
        title="Email the families"
        description={`One email to each family booked on ${label}.`}
        actions={
          <>
            <Button variant="secondary" onClick={close}>
              Close
            </Button>
            <Button type="submit" form={mailFormId} disabled={mail.pending}>
              Send email
            </Button>
          </>
        }
      >
        <form
          id={mailFormId}
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            mail.run(async () => {
              const res = await emailGroup(id, String(f.get("subject")), String(f.get("message")));
              if (res.ok) {
                setSent(`Sent to ${res.sent} ${res.sent === 1 ? "family" : "families"}.`);
                close();
              }
              return res;
            });
          }}
        >
          <Field label="Subject" name="subject" required maxLength={120} />
          <TextareaField label="Message" name="message" required maxLength={2000} />
          <ActionError message={mail.error} />
        </form>
      </Dialog>

      <Dialog
        open={dialog === "cancel"}
        onClose={close}
        title="Cancel this session?"
        description={
          booked
            ? `${booked} ${booked === 1 ? "family is" : "families are"} booked. Their seats are cancelled for free and each family is emailed. If someone has paid, choose what happens to it.`
            : "Nobody is booked on it."
        }
        actions={
          <>
            <Button variant="secondary" onClick={close}>
              Keep session
            </Button>
            <Button disabled={cancel.pending} onClick={() => cancel.run(() => cancelSession(id, false), close)}>
              Cancel and credit any payments
            </Button>
            <Button disabled={cancel.pending} onClick={() => cancel.run(() => cancelSession(id, true), close)}>
              Cancel and refund any payments
            </Button>
          </>
        }
      >
        <ActionError message={cancel.error} />
      </Dialog>
    </div>
  );
}
