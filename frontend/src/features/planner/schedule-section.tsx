import { Icon } from "../../components/icon";
import { ScheduleView } from "../../components/schedule-view";
import type { Book, ReadingMethod, ScheduleResult } from "../../types";

interface Props {
  books: Book[];
  bookCount: number;
  noDaysWarning: boolean;
  pagesPerDay: number;
  method: ReadingMethod;
  schedule: ScheduleResult | null;
  onReorder: (books: Book[]) => void;
}

export function ScheduleSection({
  books,
  bookCount,
  noDaysWarning,
  pagesPerDay,
  method,
  schedule,
  onReorder,
}: Props) {
  const showSchedule = bookCount > 0 && !noDaysWarning && schedule !== null;
  return (
    <section class="reading-planner__section">
      {!showSchedule && (
        <div class="hon-section-heading">
          <h2>
            <Icon name="route" size={24} />
            <span>Schedule</span>
          </h2>
        </div>
      )}
      {bookCount === 0 ? (
        <p class="reading-planner__empty">Add books to get started.</p>
      ) : noDaysWarning ? (
        <p class="reading-planner__empty">
          Select reading days to see your schedule.
        </p>
      ) : schedule ? (
        <ScheduleView
          books={books}
          result={schedule}
          pagesPerDay={pagesPerDay}
          method={method}
          onReorder={onReorder}
        />
      ) : null}
    </section>
  );
}
