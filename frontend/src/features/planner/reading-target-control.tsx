import { Icon } from "../../components/icon";
import { Tooltip } from "../../components/tooltip";
import { useLanguage } from "../../i18n";

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
  const { copy, locale } = useLanguage();
  return (
    <>
      <section class="reading-planner__section">
        <div class="reading-planner__label">
          <Icon name="clock" size={16} aria-hidden="true" />
          <label for="ppd-input">{copy.planner.pagesPerDay}</label>
          <Tooltip content={copy.planner.pagesTip} />
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
            aria-label={copy.planner.pagesSlider}
            disabled={disabled}
          />
        </div>
      </section>
      <section class="reading-planner__section">
        <div class="reading-planner__label">
          <Icon name="calendar" size={16} aria-hidden="true" />
          <label for="finish-input">{copy.planner.finishBy}</label>
          <Tooltip content={copy.planner.dateTip} />
        </div>
        <input
          class="hon-input hon-mono reading-planner__date-input"
          id="finish-input"
          type="date"
          lang={locale}
          value={finishDate}
          min={today}
          onInput={(event) =>
            onDateChange((event.target as HTMLInputElement).value)
          }
          disabled={disabled}
        />
        {dateTooSoon && (
          <p class="reading-planner__warn" role="alert">
            {copy.planner.datePast}
          </p>
        )}
      </section>
    </>
  );
}
