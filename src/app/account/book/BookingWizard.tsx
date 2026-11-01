"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { BlockStep, BundleStep, GroupSessionStep } from "./steps/SessionStep";
import { ChildStep } from "./steps/ChildStep";
import { LocationStep } from "./steps/LocationStep";
import { ReviewStep } from "./steps/ReviewStep";
import { SlotStep } from "./steps/SlotStep";
import { LOCATION_LABEL, TYPE_LABEL } from "./steps/labels";
import { blockProducts, sessionsForLevel } from "./steps/options";
import { summarise } from "./steps/summary";
import { TypeStep } from "./steps/TypeStep";
import type { Selection, WizardData } from "./types";

type Step = "child" | "type" | "location" | "slot" | "session" | "review";

/** Child -> type -> location -> slot/session -> review -> confirm. */
export function BookingWizard({ data }: { data: WizardData }) {
  const [sel, setSel] = useState<Selection>({});
  const [history, setHistory] = useState<Step[]>(["child"]);
  const step = history[history.length - 1];

  const go = (next: Step, patch: Partial<Selection>) => {
    setSel((s) => ({ ...s, ...patch }));
    setHistory((h) => [...h, next]);
  };
  const back = () => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));

  const child = data.children.find((c) => c.id === sel.childId);
  // A child only ever sees group sessions at their own level (KS3 or GCSE).
  const sessions = child ? sessionsForLevel(data.sessions, child.level) : [];
  const lesson = sel.type === "assessment" || sel.type === "one_to_one" ? sel.type : null;
  const summary = step === "review" ? summarise(sel, data) : null;
  // What has been chosen on the steps before this one (the review step lists everything itself).
  const chosen = [
    step !== "child" && step !== "review" ? child?.name : undefined,
    (step === "location" || step === "slot" || step === "session") && sel.type ? TYPE_LABEL[sel.type] : undefined,
    step === "slot" && sel.location ? LOCATION_LABEL[sel.location] : undefined,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6" data-testid="booking-wizard">
      {history.length > 1 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Button variant="quiet" onClick={back} className="-ml-5">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5l-5 5 5 5" />
            </svg>
            Back
          </Button>
          {chosen.length ? <p className="text-small text-navy-600">{chosen.join(" · ")}</p> : null}
        </div>
      ) : null}

      {step === "child" ? (
        <ChildStep items={data.children} onSelect={(childId) => go("type", { childId })} />
      ) : null}

      {step === "type" && child ? (
        <TypeStep
          child={child}
          settings={data.settings}
          sessions={sessions}
          familyMessage={data.familyMessage}
          onSelect={(type) =>
            go(type === "assessment" || type === "one_to_one" ? "location" : "session", {
              type,
              slot: undefined,
              sessionId: undefined,
              bundleDate: undefined,
              block: undefined,
            })
          }
        />
      ) : null}

      {step === "location" && lesson ? (
        <LocationStep
          type={lesson}
          settings={data.settings}
          initial={sel}
          onDone={(choice) => go("slot", { homeAddress: undefined, postcode: undefined, ...choice })}
        />
      ) : null}

      {step === "slot" && lesson && child && sel.location ? (
        <SlotStep childId={child.id} type={lesson} location={sel.location} onSelect={(slot) => go("review", { slot })} />
      ) : null}

      {step === "session" && sel.type === "group" ? (
        <GroupSessionStep sessions={sessions} onSelect={(sessionId) => go("review", { sessionId })} />
      ) : null}
      {step === "session" && sel.type === "sunday_bundle" ? (
        <BundleStep sessions={sessions} onSelect={(bundleDate) => go("review", { bundleDate })} />
      ) : null}
      {step === "session" && sel.type === "block" ? (
        <BlockStep
          sessions={sessions}
          products={child ? blockProducts(sessions, child.level) : []}
          settings={data.settings}
          initial={sel.block}
          onSelect={(block) => go("review", { block })}
        />
      ) : null}

      {step === "review" && summary ? (
        <ReviewStep summary={summary} settings={data.settings} />
      ) : null}
    </div>
  );
}
