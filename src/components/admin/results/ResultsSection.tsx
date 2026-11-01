"use client";

import { useRef, useState } from "react";
import { deleteResult, prepareResultUpload, publishResult, saveResult, unpublishResult } from "@/app/admin/(secure)/families/results-actions";
import { ActionError, useAdminAction } from "@/components/admin/useAdminAction";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, SelectField, TextareaField } from "@/components/ui/Field";
import { fail } from "@/lib/admin/result";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatLondon } from "@/lib/format";
import { KIND_LABEL, RESULT_BUCKET, RESULT_KINDS, scoreLine, type ResultKind } from "@/lib/results/validation";

export interface ResultView {
  id: string;
  title: string;
  kind: ResultKind;
  takenOn: string;
  score: number;
  outOf: number;
  grade: string | null;
  wentWell: string;
  toImprove: string;
  published: boolean;
  attachmentUrl: string | null;
}

const text = (d: FormData, k: string) => (typeof d.get(k) === "string" ? (d.get(k) as string) : "");

/** Uploads the attachment (if any) straight to private storage, then saves the result. */
async function submit(childId: string, id: string | undefined, removeCurrent: boolean, data: FormData) {
  const picked = [data.get("photo"), data.get("file")].find((f): f is File => f instanceof File && f.size > 0);
  let attachmentPath: string | null | undefined = removeCurrent ? null : undefined;
  if (picked) {
    const ticket = await prepareResultUpload(picked.type, picked.size, text(data, "takenOn"));
    if (!ticket.ok) return ticket;
    const up = await createBrowserClient().storage.from(RESULT_BUCKET).uploadToSignedUrl(ticket.path, ticket.token, picked, { contentType: picked.type });
    if (up.error) return fail("The file did not upload. Please try again.");
    attachmentPath = ticket.path;
  }
  return saveResult({
    id,
    childId,
    title: text(data, "title"),
    kind: text(data, "kind"),
    takenOn: text(data, "takenOn"),
    score: text(data, "score"),
    outOf: text(data, "outOf"),
    grade: text(data, "grade"),
    wentWell: text(data, "wentWell"),
    toImprove: text(data, "toImprove"),
    attachmentPath,
  });
}

function ResultForm({ childId, today, initial, onDone, onCancel }: { childId: string; today: string; initial?: ResultView; onDone: () => void; onCancel: () => void }) {
  const { run, pending, error } = useAdminAction();
  const [removeCurrent, setRemoveCurrent] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      aria-label={initial ? `Edit ${initial.title}` : "Add a result"}
      className="grid gap-4 rounded-field border border-sky-200 bg-white p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        run(() => submit(childId, initial?.id, removeCurrent, data), onDone);
      }}
    >
      <Field label="Title" name="title" maxLength={120} defaultValue={initial?.title} autoComplete="off" required className="sm:col-span-2" />
      <SelectField label="Type" name="kind" defaultValue={initial?.kind ?? "end_of_topic"} required>
        {RESULT_KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND_LABEL[k]}
          </option>
        ))}
      </SelectField>
      <Field label="Date taken" name="takenOn" type="date" max={today} defaultValue={initial?.takenOn ?? today} required />
      <Field label="Score" name="score" inputMode="numeric" defaultValue={initial?.score} autoComplete="off" required />
      <Field label="Out of" name="outOf" inputMode="numeric" defaultValue={initial?.outOf} autoComplete="off" required />
      <Field label="Grade (optional)" name="grade" maxLength={20} defaultValue={initial?.grade ?? ""} autoComplete="off" />
      <TextareaField label="What went well" name="wentWell" rows={4} maxLength={2000} defaultValue={initial?.wentWell} required className="sm:col-span-2" />
      <TextareaField label="What to improve" name="toImprove" rows={4} maxLength={2000} defaultValue={initial?.toImprove} required className="sm:col-span-2" />
      {initial?.attachmentUrl ? (
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <a href={initial.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-4">
            View current attachment
          </a>
          <label className="inline-flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-5" checked={removeCurrent} onChange={(e) => setRemoveCurrent(e.target.checked)} />
            Remove the current attachment
          </label>
        </div>
      ) : null}
      <Field label="Take a photo of the paper" name="photo" type="file" accept="image/*" capture="environment" hint="Opens the camera on a phone." />
      <Field label="Or choose a file" name="file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" hint="A photo or PDF, up to 10 MB. A new file replaces the current one." />
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save result"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <ActionError message={error} />
      </div>
    </form>
  );
}

function ResultRow({ r, childId, today, name }: { r: ResultView; childId: string; today: string; name: string }) {
  const { run, pending, error } = useAdminAction();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="flex flex-col gap-3 rounded-field border border-sky-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{r.title}</strong>
        {r.published ? <Badge tone="success">Published</Badge> : <Badge tone="warning">Draft</Badge>}
      </div>
      <p className="text-small text-navy-600">
        {KIND_LABEL[r.kind]} · {formatLondon(new Date(`${r.takenOn}T12:00:00Z`), "d MMM yyyy")} · {scoreLine(r.score, r.outOf)}
        {r.grade ? ` · grade ${r.grade}` : ""}
        {r.attachmentUrl ? " · file attached" : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {r.published ? (
          <Button variant="secondary" disabled={pending} aria-label={`Unpublish ${r.title} for ${name}`} onClick={() => run(() => unpublishResult(r.id))}>
            Unpublish
          </Button>
        ) : (
          <Button disabled={pending} aria-label={`Publish ${r.title} for ${name}`} onClick={() => run(() => publishResult(r.id))}>
            {pending ? "Publishing..." : "Publish"}
          </Button>
        )}
        <Button variant="secondary" aria-label={`Edit ${r.title}`} onClick={() => setEditing((v) => !v)}>
          {editing ? "Close editor" : "Edit"}
        </Button>
        <Button variant="secondary" disabled={pending} aria-label={`Delete ${r.title}`} onClick={() => setConfirm(true)}>
          Delete
        </Button>
      </div>
      <ActionError message={confirm ? undefined : error} />
      {editing ? <ResultForm childId={childId} today={today} initial={r} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} /> : null}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete this result?"
        description={`This removes "${r.title}" and its attachment for good${r.published ? ", and the parent will no longer see it" : ""}.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Keep result
            </Button>
            <Button disabled={pending} onClick={() => run(() => deleteResult(r.id), () => setConfirm(false))}>
              Delete result
            </Button>
          </>
        }
      >
        <ActionError message={error} />
      </Dialog>
    </li>
  );
}

/** A child's test results: add, edit, delete, publish and unpublish. Drafts are invisible to the parent. */
export function ResultsSection({ childId, name, today, items }: { childId: string; name: string; today: string; items: ResultView[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <section aria-label={`Results for ${name}`} className="flex flex-col gap-3">
      <h4 className="font-display font-semibold">Results</h4>
      {items.length ? (
        <ul className="flex flex-col gap-2">
          {items.map((r) => (
            <ResultRow key={r.id} r={r} childId={childId} today={today} name={name} />
          ))}
        </ul>
      ) : (
        <p className="text-navy-600">No results yet.</p>
      )}
      {adding ? (
        <ResultForm childId={childId} today={today} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Add a result for {name}
          </Button>
        </div>
      )}
    </section>
  );
}
