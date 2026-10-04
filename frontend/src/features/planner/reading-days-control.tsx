import { DayPicker } from "../../components/day-picker";
import { Icon } from "../../components/icon";
import { Tooltip } from "../../components/tooltip";
import { useLanguage } from "../../i18n";
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
  const { copy } = useLanguage();
  return (
    <section class="reading-planner__section">
      <p class="hon-section-title">
        <Icon name="calendar" size={14} aria-hidden="true" />
        <span>{copy.planner.readingDays}</span>
        <Tooltip content={copy.planner.daysTip} />
      </p>
      <DayPicker selected={readingDays} onChange={onChange} />
      {showWarning && (
        <p class="reading-planner__warn" role="alert">
          {copy.planner.noDays}
        </p>
      )}
    </section>
  );
}
