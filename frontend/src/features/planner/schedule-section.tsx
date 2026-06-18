import { Route } from "lucide-preact";
import { ScheduleView } from "../../components/schedule-view";
import { Tooltip } from "../../components/tooltip";
import type { ReadingMethod, ScheduleResult } from "../../types";

interface Props {
  bookCount: number;
  noDaysWarning: boolean;
  pagesPerDay: number;
  method: ReadingMethod;
  schedule: ScheduleResult | null;
}

export function ScheduleSection({
  bookCount,
  noDaysWarning,
  pagesPerDay,
  method,
  schedule,
}: Props) {
  return (
    <section class="reading-planner__section">
      <p class="hon-section-title">
        <Route size={14} aria-hidden="true" />
        <span>Schedule</span>
        <Tooltip content="Generated calendar from books, progress, pace, method, and reading days." />
      </p>
      {bookCount === 0 ? (
        <p class="reading-planner__empty">Add books to get started.</p>
      ) : noDaysWarning ? (
        <p class="reading-planner__empty">
          Select reading days to see your schedule.
        </p>
      ) : schedule ? (
        <ScheduleView
          result={schedule}
          pagesPerDay={pagesPerDay}
          method={method}
        />
      ) : null}
    </section>
  );
}
