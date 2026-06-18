import { CalendarDays } from "lucide-preact";
import { DayPicker } from "../../components/day-picker";
import { Tooltip } from "../../components/tooltip";
import type { DayOfWeek } from "../../types";

interface Props {
  readingDays: DayOfWeek[];
  onChange: (days: DayOfWeek[]) => void;
  showWarning: boolean;
}

export function ReadingDaysControl({
  readingDays,
  onChange,
  showWarning,
}: Props) {
  return (
    <section class="reading-planner__section">
      <p class="hon-section-title">
        <CalendarDays size={14} aria-hidden="true" />
        <span>Reading days</span>
        <Tooltip content="Pick reading days. Page targets apply only to selected days." />
      </p>
      <DayPicker selected={readingDays} onChange={onChange} />
      {showWarning && (
        <p class="reading-planner__warn" role="alert">
          Select at least one reading day.
        </p>
      )}
    </section>
  );
}
