import { BookOpen, GripVertical, X } from "lucide-preact";
import { useRef, useState } from "preact/hooks";
import type { Book } from "../types";

interface Props {
  books: Book[];
  onRemove: (id: string) => void;
  onReorder: (books: Book[]) => void;
}

const DRAG_THRESHOLD_PX = 8;

interface DragSlot {
  top: number;
  height: number;
}

interface DragState {
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

function reorderBooksByIndex(books: Book[], fromIndex: number, toIndex: number): Book[] {
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return books;
  }

  const nextBooks = [...books];
  const [draggedBook] = nextBooks.splice(fromIndex, 1);
  nextBooks.splice(toIndex, 0, draggedBook);
  return nextBooks;
}

export function BookList({ books, onRemove, onReorder }: Props) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const cleanupRef = useRef<(() => void) | null>(null);

  const handlePointerDown = (bookId: string, event: PointerEvent) => {
    if ("button" in event && event.button !== 0) return;
    if ((event.target as HTMLElement).closest(".book-list__remove")) return;

    const originIndex = books.findIndex((book) => book.id === bookId);
    if (originIndex < 0) return;

    const slots = books
      .map((book) => itemRefs.current[book.id]?.getBoundingClientRect())
      .filter((slot): slot is DOMRect => slot !== null && slot !== undefined)
      .map((slot) => ({ top: slot.top, height: slot.height }));

    if (slots.length !== books.length) return;

    const itemGap =
      slots.length > 1
        ? Math.max(0, slots[1].top - slots[0].top - slots[0].height)
        : 10;

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
      itemGap,
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

      let targetIndex = currentState.originIndex;
      if (activated) {
        const originSlot = currentState.slots[currentState.originIndex];
        const currentCenter =
          originSlot.top + originSlot.height / 2 + deltaY;

        if (deltaY > 0) {
          for (let index = currentState.originIndex + 1; index < currentState.slots.length; index += 1) {
            const slotCenter =
              currentState.slots[index].top +
              currentState.slots[index].height / 2;
            if (currentCenter > slotCenter) {
              targetIndex = index;
            }
          }
        } else if (deltaY < 0) {
          for (let index = currentState.originIndex - 1; index >= 0; index -= 1) {
            const slotCenter =
              currentState.slots[index].top +
              currentState.slots[index].height / 2;
            if (currentCenter < slotCenter) {
              targetIndex = index;
            }
          }
        }
      }

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
          reorderBooksByIndex(
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

  const getItemStyle = (index: number, bookId: string) => {
    if (!dragState) return undefined;

    const deltaY = dragState.currentY - dragState.startY;
    const slotDistance =
      dragState.slots[dragState.originIndex]?.height + dragState.itemGap;

    if (dragState.bookId === bookId) {
      if (!dragState.activated) return undefined;
      const tilt = Math.max(-2, Math.min(2, deltaY / 18));
      return {
        transform: `translateY(${deltaY}px) scale(1.018) rotate(${tilt}deg)`,
        zIndex: "3",
        transition: "none",
      };
    }

    if (!dragState.activated) return undefined;

    let translateY = 0;
    if (
      dragState.targetIndex > dragState.originIndex &&
      index > dragState.originIndex &&
      index <= dragState.targetIndex
    ) {
      translateY = -slotDistance;
    } else if (
      dragState.targetIndex < dragState.originIndex &&
      index >= dragState.targetIndex &&
      index < dragState.originIndex
    ) {
      translateY = slotDistance;
    }

    if (translateY === 0) return undefined;
    return { transform: `translateY(${translateY}px)` };
  };

  if (books.length === 0) {
    return (
      <div class="book-list-empty">
        <BookOpen class="book-list-empty__icon" size={32} aria-hidden="true" />
        <p class="book-list-empty__text">
          Search for a book above to add it to your list.
        </p>
      </div>
    );
  }

  const totalPages = books.reduce((sum, b) => sum + b.page_count, 0);

  return (
    <div class="book-list">
      <ul class="book-list__items">
        {books.map((book) => (
          <li
            key={book.id}
            ref={(element) => {
              itemRefs.current[book.id] = element;
            }}
            data-book-id={book.id}
            class={`book-list__item${dragState?.bookId === book.id && dragState.activated ? " book-list__item--dragging" : ""}${dragState?.targetIndex === books.findIndex((candidate) => candidate.id === book.id) && dragState?.targetIndex !== dragState?.originIndex ? " book-list__item--drop-target" : ""}`}
            style={getItemStyle(books.findIndex((candidate) => candidate.id === book.id), book.id)}
            onPointerDown={(event) => handlePointerDown(book.id, event)}
          >
            <span class="book-list__drag-handle" aria-hidden="true">
              <GripVertical size={16} aria-hidden="true" />
            </span>
            {book.cover_url && (
              <img
                class="book-list__cover"
                src={book.cover_url}
                alt=""
                draggable="false"
                width={28}
                height={42}
              />
            )}
            <div class="book-list__info">
              <span class="book-list__title">{book.title}</span>
              <span class="book-list__meta hon-mono">
                {book.author} · {book.page_count}pp
              </span>
            </div>
            <button
              type="button"
              class="book-list__remove"
              aria-label={`Remove ${book.title}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onRemove(book.id)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <p class="book-list__total hon-mono">
        {books.length} book{books.length === 1 ? "" : "s"} ·{" "}
        {totalPages.toLocaleString()} pages total
      </p>
    </div>
  );
}
