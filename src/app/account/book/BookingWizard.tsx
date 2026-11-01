"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { BundleStep, GroupSessionStep } from "./steps/SessionStep";
import { ChildStep } from "./steps/ChildStep";
import { LocationStep } from "./steps/LocationStep";
import { PassBookReview, PassBuyReview, PassCards, PassSessionStep, PassSizeStep } from "./steps/PassSteps";
import { ReviewStep } from "./steps/ReviewStep";
import { SlotStep } from "./steps/SlotStep";
import { LOCATION_LABEL, TYPE_LABEL } from "./steps/labels";
import { sessionsForLevel } from "./steps/options";
import { summarise } from "./steps/summary";
import { TypeStep } from "./steps/TypeStep";
import type { Selection, WizardData } from "./types";

type Step = "child" | "type" | "location" | "slot" | "session" | "review" | "pass_size" | "pass_buy" | "pass_session" | "pass_book";

/**
 * Child -> type -> location -> slot/session -> review -> confirm. Buying a
 * pass: type -> size -> buy. Booking with a pass: the pass card -> session ->
 * book (or straight there from the dashboard with `initialPassId`).
 */
export function BookingWizard({ data, initialPassId }: { data: WizardData; initialPassId?: string }) {
  const start = data.passes.find((p) => p.id === initialPassId && p.bookable);
  const [sel, setSel] = useState<Selection>(start ? { childId: start.childId, type: "pass_session", passId: start.id } : {});
  const [history, setHistory] = useState<Step[]>(start ? ["child", "type", "pass_session"] : ["child"]);
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
  const childPasses = child ? data.passes.filter((p) => p.childId === child.id) : [];
  const pass = data.passes.find((p) => p.id === sel.passId);
  const review = step === "review" || step === "pass_buy" || step === "pass_book";
  // What has been chosen on the steps before this one (the review steps list everything themselves).
  const chosen = [
    step !== "child" && !review ? child?.name : undefined,
    (step === "location" || step === "slot" || step === "session" || step === "pass_size" || step === "pass_session") && sel.type
      ? TYPE_LABEL[sel.type]
      : undefined,
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
        <div className="flex flex-col gap-6">
          {data.familyMessage ? null : (
            <PassCards
              passes={childPasses}
              onBook={(passId) => go("pass_session", { type: "pass_session", passId, sessionId: undefined, bundleDate: undefined })}
            />
          )}
          <TypeStep
            child={child}
            settings={data.settings}
            sessions={sessions}
            familyMessage={data.familyMessage}
            onSelect={(type) =>
              go(type === "assessment" || type === "one_to_one" ? "location" : type === "pass" ? "pass_size" : "session", {
                type,
                slot: undefined,
                sessionId: undefined,
                bundleDate: undefined,
                passSessions: undefined,
                passId: undefined,
              })
            }
          />
        </div>
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

      {step === "pass_size" && child ? (
        <PassSizeStep child={child} settings={data.settings} onSelect={(passSessions) => go("pass_buy", { passSessions })} />
      ) : null}
      {step === "pass_buy" && child && sel.passSessions ? (
        <PassBuyReview child={child} sessions={sel.passSessions} settings={data.settings} />
      ) : null}
      {step === "pass_session" && pass ? (
        <PassSessionStep
          pass={pass}
          sessions={sessions}
          onSelect={(pick) =>
            go("pass_book", "sessionId" in pick ? { sessionId: pick.sessionId, bundleDate: undefined } : { bundleDate: pick.bundleDate, sessionId: undefined })
          }
        />
      ) : null}
      {step === "pass_book" && pass && child && (sel.sessionId || sel.bundleDate) ? (
        <PassBookReview
          pass={pass}
          pick={sel.sessionId ? { sessionId: sel.sessionId } : { bundleDate: sel.bundleDate! }}
          sessions={sessions}
          childName={child.name}
          settings={data.settings}
        />
      ) : null}

      {step === "review" && summary ? (
        <ReviewStep summary={summary} settings={data.settings} />
      ) : null}
    </div>
  );
}
