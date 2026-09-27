import { ReadingDaysControl } from "../features/planner/reading-days-control";
import { ReadingMethodControl } from "../features/planner/reading-method-control";
import { ReadingTargetControl } from "../features/planner/reading-target-control";
import { ScheduleSection } from "../features/planner/schedule-section";
import { useReadingPlanner } from "../features/planner/use-reading-planner";
import type { Book } from "../types";

export function PlannerControls({
  planner,
  bookCount,
}: { planner: ReturnType<typeof useReadingPlanner>; bookCount: number }) {
  return (
    <div class="reading-planner__controls">
      <ReadingDaysControl
        readingDays={planner.readingDays}
        onChange={planner.setReadingDays}
        showWarning={planner.noDaysWarning}
      />
      <ReadingTargetControl
        pagesPerDay={planner.pagesPerDay}
        finishDate={planner.finishDate}
        today={planner.today}
        disabled={planner.noDaysWarning || bookCount === 0}
        dateTooSoon={planner.dateTooSoonWarning}
        onPagesChange={planner.setPagesPerDay}
        onDateChange={planner.setFinishDate}
      />
      <ReadingMethodControl
        method={planner.method}
        onChange={planner.setMethod}
      />
    </div>
  );
}

// Standalone composition retained for embedded use and existing behavior tests.
export function ReadingPlanner({
  books,
  onReorder,
}: { books: Book[]; onReorder: (books: Book[]) => void }) {
  const planner = useReadingPlanner(books);
  return (
    <div class="reading-planner">
      <PlannerControls planner={planner} bookCount={books.length} />
      <ScheduleSection
        books={books}
        bookCount={books.length}
        noDaysWarning={planner.noDaysWarning}
        pagesPerDay={planner.pagesPerDay}
        method={planner.method}
        schedule={planner.schedule}
        onReorder={onReorder}
      />
    </div>
  );
}
