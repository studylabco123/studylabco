"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Action buttons, shown at the bottom right. */
  actions?: ReactNode;
  className?: string;
};

/**
 * Modal dialog built on native <dialog>.showModal(): focus is trapped, the
 * page behind is inert, and Escape closes it. Focus returns to the opener.
 */
export function Dialog({ open, onClose, title, description, children, actions, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "m-auto w-[min(32rem,calc(100vw-2rem))] rounded-card bg-white p-0 text-navy-900 shadow-pop",
        "open:motion-safe:animate-dialog-in",
        className,
      )}
    >
      <div className="flex flex-col gap-4 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-h3">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-sky-100"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {description ? (
          <p id={descriptionId} className="text-body text-navy-600">
            {description}
          </p>
        ) : null}
        {children}
        {actions ? <div className="flex flex-wrap justify-end gap-3 pt-2">{actions}</div> : null}
      </div>
    </dialog>
  );
}
