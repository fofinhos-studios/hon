import { Split } from "lucide-preact";
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
        <Split size={14} aria-hidden="true" />
        <span>Reading method</span>
        <Tooltip content="Sequential finishes books in order. Interleaved shares daily pages across active books." />
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
          ? "Finish one book before starting the next. Your full daily page budget applies to the current book."
          : "Split your daily page budget across all active books. Larger books get a bigger share so everything finishes around the same time."}
      </p>
    </section>
  );
}
