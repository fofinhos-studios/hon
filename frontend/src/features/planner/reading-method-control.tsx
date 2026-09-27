import { Icon } from "../../components/icon";
import { Tooltip } from "../../components/tooltip";
import type { ReadingMethod } from "../../types";

const METHODS: ReadingMethod[] = ["sequential", "interleaved"];

interface Props {
  method: ReadingMethod;
  onChange: (method: ReadingMethod) => void;
}

export function ReadingMethodControl({ method, onChange }: Props) {
  return (
    <section class="reading-planner__section">
      <p class="hon-section-title">
        <Icon name="split" size={14} aria-hidden="true" />
        <span>Reading method</span>
        <Tooltip content="Sequential finishes books in order. Interleaved splits daily pages across books." />
      </p>
      <fieldset
        class="reading-planner__method-group"
        aria-label="Reading method"
      >
        {METHODS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            class={`hon-btn reading-planner__method-btn${method === candidate ? " reading-planner__method-btn--active" : ""}`}
            aria-pressed={method === candidate ? "true" : "false"}
            onClick={() => onChange(candidate)}
          >
            {candidate.charAt(0).toUpperCase() + candidate.slice(1)}
          </button>
        ))}
      </fieldset>
      <p class="reading-planner__method-help">
        {method === "sequential"
          ? "One book at a time."
          : "Daily pages split by each book’s remaining pages."}
      </p>
    </section>
  );
}
