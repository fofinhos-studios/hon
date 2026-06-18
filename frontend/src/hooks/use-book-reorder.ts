import { useEffect, useRef, useState } from "preact/hooks";
import {
  type DragState,
  calculateItemGap,
  findTargetIndex,
  getBookReorderStyle,
  reorderBooks,
} from "../features/books/book-reorder";
import type { Book } from "../types";

const DRAG_THRESHOLD_PX = 8;

export function useBookReorder(
  books: Book[],
  onReorder: (books: Book[]) => void,
) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const handlePointerDown = (bookId: string, event: PointerEvent) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button,input")) return;

    const originIndex = books.findIndex((book) => book.id === bookId);
    const slots = books
      .map((book) => itemRefs.current[book.id]?.getBoundingClientRect())
      .filter((slot): slot is DOMRect => slot !== null && slot !== undefined)
      .map(({ top, height }) => ({ top, height }));
    if (originIndex < 0 || slots.length !== books.length) return;

    cleanupRef.current?.();
    let currentState: DragState = {
      bookId,
      pointerId: event.pointerId,
      originIndex,
      targetIndex: originIndex,
      startY: event.clientY,
      currentY: event.clientY,
      activated: false,
      slots,
      itemGap: calculateItemGap(slots),
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      cleanupRef.current = null;
    };
    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== currentState.pointerId) return;
      const deltaY = moveEvent.clientY - currentState.startY;
      const activated =
        currentState.activated || Math.abs(deltaY) >= DRAG_THRESHOLD_PX;
      const targetIndex = activated
        ? findTargetIndex(currentState.slots, currentState.originIndex, deltaY)
        : currentState.originIndex;
      currentState = {
        ...currentState,
        activated,
        currentY: moveEvent.clientY,
        targetIndex,
      };
      setDragState(currentState);
    };
    const handlePointerEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== currentState.pointerId) return;
      if (
        currentState.activated &&
        currentState.targetIndex !== currentState.originIndex
      ) {
        onReorder(
          reorderBooks(
            books,
            currentState.originIndex,
            currentState.targetIndex,
          ),
        );
      }
      cleanup();
      setDragState(null);
    };

    cleanupRef.current = cleanup;
    setDragState(currentState);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
  };

  return {
    dragState,
    getItemStyle: (index: number, bookId: string) =>
      getBookReorderStyle(dragState, index, bookId),
    handlePointerDown,
    setItemRef: (bookId: string, element: HTMLLIElement | null) => {
      itemRefs.current[bookId] = element;
    },
  };
}
