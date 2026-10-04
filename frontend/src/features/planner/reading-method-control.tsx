import { Icon } from "../../components/icon";
import { Tooltip } from "../../components/tooltip";
import { useLanguage } from "../../i18n";
import type { ReadingMethod } from "../../types";

const METHODS: ReadingMethod[] = ["sequential", "interleaved"];

interface Props {
  method: ReadingMethod;
  onChange: (method: ReadingMethod) => void;
}

export function ReadingMethodControl({ method, onChange }: Props) {
  const { copy } = useLanguage();
  return (
    <section class="reading-planner__section">
      <p class="hon-section-title">
        <Icon name="split" size={14} aria-hidden="true" />
        <span>{copy.planner.method}</span>
        <Tooltip content={copy.planner.methodTip} />
      </p>
      <fieldset
        class="reading-planner__method-group"
        aria-label={copy.planner.method}
      >
        {METHODS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            class={`hon-btn reading-planner__method-btn${method === candidate ? " reading-planner__method-btn--active" : ""}`}
            aria-pressed={method === candidate ? "true" : "false"}
            onClick={() => onChange(candidate)}
          >
            {candidate === "sequential"
              ? copy.planner.sequential
              : copy.planner.interleaved}
          </button>
        ))}
      </fieldset>
      <p class="reading-planner__method-help">
        {method === "sequential"
          ? copy.planner.sequentialHelp
          : copy.planner.interleavedHelp}
      </p>
    </section>
  );
}
