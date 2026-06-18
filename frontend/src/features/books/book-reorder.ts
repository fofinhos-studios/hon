import type { JSX } from "preact";
import type { Book } from "../../types";

const DEFAULT_ITEM_GAP = 10;

export interface DragSlot {
  top: number;
  height: number;
}

export interface DragState {
  bookId: string;
  pointerId: number;
  originIndex: number;
  targetIndex: number;
  startY: number;
  currentY: number;
  activated: boolean;
  slots: DragSlot[];
  itemGap: number;
}

export function reorderBooks(
  books: Book[],
  fromIndex: number,
  toIndex: number,
): Book[] {
  const invalidIndex =
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= books.length ||
    toIndex >= books.length;
  if (invalidIndex || fromIndex === toIndex) return books;

  const nextBooks = [...books];
  const [draggedBook] = nextBooks.splice(fromIndex, 1);
  nextBooks.splice(toIndex, 0, draggedBook);
  return nextBooks;
}

export function calculateItemGap(slots: DragSlot[]): number {
  if (slots.length < 2) return DEFAULT_ITEM_GAP;
  return Math.max(0, slots[1].top - slots[0].top - slots[0].height);
}

export function findTargetIndex(
  slots: DragSlot[],
  originIndex: number,
  deltaY: number,
): number {
  const originSlot = slots[originIndex];
  if (!originSlot) return originIndex;

  const center = originSlot.top + originSlot.height / 2 + deltaY;
  let targetIndex = originIndex;
  slots.forEach((slot, index) => {
    const slotCenter = slot.top + slot.height / 2;
    if (index > originIndex && center > slotCenter) {
      targetIndex = index;
    }
    if (index < originIndex && center < slotCenter) {
      targetIndex = Math.min(targetIndex, index);
    }
  });
  return targetIndex;
}

export function getBookReorderStyle(
  dragState: DragState | null,
  index: number,
  bookId: string,
): JSX.CSSProperties | undefined {
  if (!dragState?.activated) return undefined;

  const deltaY = dragState.currentY - dragState.startY;
  const distance =
    dragState.slots[dragState.originIndex].height + dragState.itemGap;
  if (dragState.bookId === bookId) {
    return {
      transform: `translateY(${deltaY}px) scale(1.018) rotate(${Math.max(-2, Math.min(2, deltaY / 18))}deg)`,
      zIndex: "3",
      transition: "none",
    };
  }

  const movesUp =
    dragState.targetIndex > dragState.originIndex &&
    index > dragState.originIndex &&
    index <= dragState.targetIndex;
  const movesDown =
    dragState.targetIndex < dragState.originIndex &&
    index >= dragState.targetIndex &&
    index < dragState.originIndex;
  if (!movesUp && !movesDown) return undefined;
  return { transform: `translateY(${movesUp ? -distance : distance}px)` };
}
