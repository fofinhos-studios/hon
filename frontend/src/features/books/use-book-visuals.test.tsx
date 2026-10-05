import { act, render, waitFor } from "@testing-library/preact";
import { expect, test, vi } from "vitest";
import type { Book, BookVisuals } from "../../types";
import { useBookVisuals } from "./use-book-visuals";

const books: Book[] = ["a", "b", "c"].map((id) => ({
  id,
  title: id,
  author: "Author",
  kind: "page",
  format: "unspecified",
  page_count: 100,
  cover_url: null,
}));
const visuals: BookVisuals = {
  color_version: 3,
  dominant_color: "#123456",
  artwork: null,
};

test("refreshes old partial visuals on a later visit", async () => {
  const fetcher = vi.fn(async () => visuals);
  const onVisuals = vi.fn();
  function Harness() {
    useBookVisuals(
      [
        {
          ...books[0],
          visuals: { dominant_color: null, artwork: null },
          visuals_checked_at: Date.now() - 7200000,
        },
      ],
      onVisuals,
      fetcher,
    );
    return null;
  }
  render(<Harness />);
  await waitFor(() => expect(onVisuals).toHaveBeenCalledWith("a", visuals));
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("limits work to two requests and does not refetch on reorder or progress", async () => {
  const completions: Array<(value: BookVisuals) => void> = [];
  const fetcher = vi.fn(
    () => new Promise<BookVisuals>((resolve) => completions.push(resolve)),
  );
  const onVisuals = vi.fn();
  function Harness({ items }: { items: Book[] }) {
    useBookVisuals(items, onVisuals, fetcher);
    return null;
  }
  const view = render(<Harness items={books} />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  view.rerender(
    <Harness
      items={[...books].reverse().map((book) => ({ ...book, pages_read: 20 }))}
    />,
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => completions[0](visuals));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  await act(async () => {
    completions[1](visuals);
    completions[2](visuals);
  });
  expect(onVisuals).toHaveBeenCalledTimes(3);
});

test("aborts removed books and ignores their late responses", async () => {
  let complete: (value: BookVisuals) => void = () => {};
  let signal: AbortSignal | undefined;
  const fetcher = vi.fn((_book: Book, requestSignal: AbortSignal) => {
    signal = requestSignal;
    return new Promise<BookVisuals>((resolve) => {
      complete = resolve;
    });
  });
  const onVisuals = vi.fn();
  function Harness({ items }: { items: Book[] }) {
    useBookVisuals(items, onVisuals, fetcher);
    return null;
  }
  const view = render(<Harness items={[books[0]]} />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  view.rerender(<Harness items={[]} />);
  await waitFor(() => expect(signal?.aborted).toBe(true));
  await act(async () => complete(visuals));
  expect(onVisuals).not.toHaveBeenCalled();
});

test("skips persisted visuals and does not loop when service fails", async () => {
  const fetcher = vi.fn(async () => {
    throw new Error("offline");
  });
  const onVisuals = vi.fn();
  function Harness({ items }: { items: Book[] }) {
    useBookVisuals(items, onVisuals, fetcher);
    return null;
  }
  const items = [{ ...books[0], visuals }, books[1]];
  const view = render(<Harness items={items} />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  view.rerender(<Harness items={[...items]} />);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(onVisuals).not.toHaveBeenCalled();
});

test("refreshes a saved color from the old algorithm even when recently checked", async () => {
  const fetcher = vi.fn(async () => visuals);
  const onVisuals = vi.fn();
  function Harness() {
    useBookVisuals(
      [
        {
          ...books[0],
          visuals: { dominant_color: "#eedd33", artwork: null },
          visuals_checked_at: Date.now(),
        },
      ],
      onVisuals,
      fetcher,
    );
    return null;
  }
  render(<Harness />);
  await waitFor(() => expect(onVisuals).toHaveBeenCalledWith("a", visuals));
  expect(fetcher).toHaveBeenCalledTimes(1);
});
