"use client";

import type { ChildOption } from "../types";
import { Choice, ChoiceList, StepHeading } from "./shared";

export function ChildStep({ items, onSelect }: { items: ChildOption[]; onSelect: (id: string) => void }) {
  return (
    <section className="flex flex-col gap-4">
      <StepHeading>Who is the lesson for?</StepHeading>
      <ChoiceList label="Children">
        {items.map((c) => (
          <Choice
            key={c.id}
            title={c.name}
            detail={`Year ${c.schoolYear}, ${c.level} · ${
              c.approved ? "Ready for all lessons" : c.assessmentBooked ? "Assessment Lesson booked" : "Starts with an Assessment Lesson"
            }`}
            onSelect={() => onSelect(c.id)}
          />
        ))}
      </ChoiceList>
    </section>
  );
}
