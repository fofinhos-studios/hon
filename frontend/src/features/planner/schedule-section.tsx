import { Icon } from "../../components/icon";
import { ScheduleView } from "../../components/schedule-view";
import { useLanguage } from "../../i18n";
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
  const { copy } = useLanguage();
  const showSchedule = bookCount > 0 && !noDaysWarning && schedule !== null;
  return (
    <section class="reading-planner__section">
      {!showSchedule && (
        <div class="hon-section-heading">
          <h2>
            <Icon name="route" size={24} />
            <span>{copy.schedule}</span>
          </h2>
        </div>
      )}
      {bookCount === 0 ? (
        <p class="reading-planner__empty">{copy.planner.empty}</p>
      ) : noDaysWarning ? (
        <p class="reading-planner__empty">{copy.planner.selectDays}</p>
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
