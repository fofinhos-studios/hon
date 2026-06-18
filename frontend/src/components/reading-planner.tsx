import { ReadingDaysControl } from "../features/planner/reading-days-control";
import { ReadingMethodControl } from "../features/planner/reading-method-control";
import { ReadingTargetControl } from "../features/planner/reading-target-control";
import { ScheduleSection } from "../features/planner/schedule-section";
import { useReadingPlanner } from "../features/planner/use-reading-planner";
import type { Book } from "../types";

interface Props {
  books: Book[];
}

export function ReadingPlanner({ books }: Props) {
  const planner = useReadingPlanner(books);
  return (
    <div class="reading-planner">
      <ReadingDaysControl
        readingDays={planner.readingDays}
        onChange={planner.setReadingDays}
        showWarning={planner.noDaysWarning}
      />
      <hr class="hon-divider" />
      <ReadingTargetControl
        pagesPerDay={planner.pagesPerDay}
        finishDate={planner.finishDate}
        today={planner.today}
        disabled={planner.noDaysWarning || books.length === 0}
        dateTooSoon={planner.dateTooSoonWarning}
        onPagesChange={planner.setPagesPerDay}
        onDateChange={planner.setFinishDate}
      />
      <hr class="hon-divider" />
      <ReadingMethodControl
        method={planner.method}
        onChange={planner.setMethod}
      />
      <hr class="hon-divider" />
      <ScheduleSection
        bookCount={books.length}
        noDaysWarning={planner.noDaysWarning}
        pagesPerDay={planner.pagesPerDay}
        method={planner.method}
        schedule={planner.schedule}
      />
    </div>
  );
}
