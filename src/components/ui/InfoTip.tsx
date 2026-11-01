"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A small "i" button that shows a short plain-English explanation (a
 * disclosure, not a hover tooltip, so it works on touch and with a keyboard).
 * Enter, Space or a tap toggles it; Escape or a tap elsewhere closes it, and
 * Escape returns focus to the button. The panel opens in the page flow (it
 * pushes content down rather than covering it): put the tip at the end of a
 * `flex flex-wrap` row and the panel takes a full line below the row.
 */
export function InfoTip({ label, text, className }: { label: string; text: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    // On click, not pointerdown: closing first would move the page under the pointer
    // (the panel is in the flow) and the tap would land somewhere else.
    const onClick = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <div ref={wrap} className={cn("contents", className)}>
      <button
        ref={button}
        type="button"
        aria-label={`More about ${label}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full text-navy-900",
          "transition-colors duration-150 ease-out hover:bg-sky-100 aria-expanded:bg-sky-100",
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center rounded-full border-2 border-current font-display text-fine font-semibold leading-none"
        >
          i
        </span>
      </button>
      {open ? (
        <div
          id={panelId}
          className={cn(
            "w-full basis-full rounded-card border border-sky-200 bg-sky-50 px-4 py-3",
            "text-left text-small text-navy-900 motion-safe:animate-menu-in",
          )}
        >
          {text}
        </div>
      ) : null}
    </div>
  );
}
