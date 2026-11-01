"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AdminResult } from "@/lib/admin/result";

/**
 * Runs a server action, keeps its error message (shown next to the control),
 * and refreshes the page on success so the new state is shown.
 */
export function useAdminAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  function run(action: () => Promise<AdminResult>, onDone?: () => void) {
    start(async () => {
      setError(undefined);
      const res = await action();
      if (res.ok) {
        onDone?.();
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }
  return { run, pending, error };
}

export function ActionError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="w-full font-semibold text-danger-700">
      {message}
    </p>
  ) : null;
}
