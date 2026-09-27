import { Icon } from "./icon";

interface Props {
  title: string;
  onPointerDown: (event: PointerEvent) => void;
  onMove?: (direction: -1 | 1) => void;
  first?: boolean;
  last?: boolean;
}

export function ReorderControls({
  title,
  onPointerDown,
  onMove,
  first,
  last,
}: Props) {
  return (
    <div class="reorder-controls">
      <span
        class="reorder-handle"
        onPointerDown={onPointerDown}
        aria-hidden="true"
      >
        <Icon name="grip" />
      </span>
      {onMove && (
        <>
          <button
            class="hon-icon-button"
            type="button"
            aria-label={`Move ${title} up`}
            disabled={first}
            onClick={() => onMove(-1)}
          >
            <Icon name="arrowUp" size={16} />
          </button>
          <button
            class="hon-icon-button"
            type="button"
            aria-label={`Move ${title} down`}
            disabled={last}
            onClick={() => onMove(1)}
          >
            <Icon name="arrowDown" size={16} />
          </button>
        </>
      )}
    </div>
  );
}
