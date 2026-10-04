import { useLanguage } from "../i18n";
import { ALL_DAYS, type DayOfWeek } from "../types";

interface Props {
  selected: DayOfWeek[];
  onChange: (days: DayOfWeek[]) => void;
}

export function DayPicker({ selected, onChange }: Props) {
  const { copy } = useLanguage();
  const selectedSet = new Set(selected);

  const toggle = (day: DayOfWeek) => {
    if (selectedSet.has(day)) {
      onChange(selected.filter((d) => d !== day));
    } else {
      onChange([...ALL_DAYS.filter((d) => selectedSet.has(d) || d === day)]);
    }
  };

  return (
    <fieldset class="day-picker" aria-label={copy.planner.readingDays}>
      {ALL_DAYS.map((day) => {
        const active = selectedSet.has(day);
        return (
          <button
            key={day}
            type="button"
            class={`day-picker__btn${active ? " day-picker__btn--active" : ""}`}
            aria-pressed={active ? "true" : "false"}
            onClick={() => toggle(day)}
          >
            {copy.planner.days[day]}
          </button>
        );
      })}
    </fieldset>
  );
}
