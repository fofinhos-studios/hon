import { Icon } from "../../components/icon";
import { Tooltip } from "../../components/tooltip";

const DEFAULT_SLIDER_MAX = 200;

interface Props {
  pagesPerDay: number;
  finishDate: string;
  today: string;
  disabled: boolean;
  dateTooSoon: boolean;
  onPagesChange: (value: number) => void;
  onDateChange: (value: string) => void;
}

export function ReadingTargetControl({
  pagesPerDay,
  finishDate,
  today,
  disabled,
  dateTooSoon,
  onPagesChange,
  onDateChange,
}: Props) {
  return (
    <>
      <section class="reading-planner__section">
        <div class="reading-planner__label">
          <Icon name="clock" size={16} aria-hidden="true" />
          <label for="ppd-input">Pages per day</label>
          <Tooltip content="Set daily pages. Finish dates update from this pace." />
        </div>
        <div class="reading-planner__ppd">
          <input
            class="hon-input reading-planner__ppd-input hon-mono"
            id="ppd-input"
            type="number"
            min={1}
            step={1}
            value={pagesPerDay}
            onInput={(event) =>
              onPagesChange(Number((event.target as HTMLInputElement).value))
            }
            disabled={disabled}
          />
          <input
            class="reading-planner__slider"
            type="range"
            min={1}
            max={Math.max(DEFAULT_SLIDER_MAX, pagesPerDay)}
            value={pagesPerDay}
            onInput={(event) =>
              onPagesChange(Number((event.target as HTMLInputElement).value))
            }
            aria-label="Pages per day slider"
            disabled={disabled}
          />
        </div>
      </section>
      <section class="reading-planner__section">
        <div class="reading-planner__label">
          <Icon name="calendar" size={16} aria-hidden="true" />
          <label for="finish-input">Finish by</label>
          <Tooltip content="Set target date. Pages per day update to meet it." />
        </div>
        <input
          class="hon-input hon-mono reading-planner__date-input"
          id="finish-input"
          type="date"
          value={finishDate}
          min={today}
          onInput={(event) =>
            onDateChange((event.target as HTMLInputElement).value)
          }
          disabled={disabled}
        />
        {dateTooSoon && (
          <p class="reading-planner__warn" role="alert">
            Date is in the past.
          </p>
        )}
      </section>
    </>
  );
}
