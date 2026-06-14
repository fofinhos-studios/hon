import { HelpCircle } from "lucide-preact";

interface Props {
  content: string;
}

export function Tooltip({ content }: Props) {
  return (
    <span class="hon-tooltip" role="tooltip" aria-label={content}>
      <HelpCircle size={13} class="hon-tooltip__icon" aria-hidden="true" />
      <span class="hon-tooltip__content">{content}</span>
    </span>
  );
}
