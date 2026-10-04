import { useId } from "preact/hooks";
import { useLanguage } from "../i18n";
import { Icon } from "./icon";

export function Tooltip({ content }: { content: string }) {
  const { copy } = useLanguage();
  const id = useId();
  return (
    <span class="hon-tooltip">
      <button
        type="button"
        class="hon-icon-button hon-tooltip__trigger"
        aria-label={copy.moreInformation}
        aria-describedby={id}
      >
        <Icon name="help" size={18} />
      </button>
      <span id={id} role="tooltip" class="hon-tooltip__content">
        {content}
      </span>
    </span>
  );
}
