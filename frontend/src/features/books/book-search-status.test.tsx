import "../../test/setup";
import { act, cleanup, render } from "@testing-library/preact";
import { afterEach, expect, test, vi } from "vitest";
import { BookSearchStatus } from "./book-search-status";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test("updates elapsed waiting, resets for the next request and stops its timer", () => {
  vi.useFakeTimers();
  const view = render(<BookSearchStatus loading error="" resultCount={0} />);
  expect(view.getByText("0s elapsed")).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(view.getByRole("status").textContent).toBe(
    "Still searching catalogs…",
  );
  expect(view.getByText("5s elapsed").getAttribute("aria-hidden")).toBe("true");
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(view.getByRole("status").textContent).toBe(
    "Taking longer than usual…",
  );
  view.rerender(<BookSearchStatus loading={false} error="" resultCount={2} />);
  expect(view.getByText("2 results found")).toBeTruthy();
  expect(vi.getTimerCount()).toBe(0);
  view.rerender(<BookSearchStatus loading error="" resultCount={0} />);
  expect(view.getByText("0s elapsed")).toBeTruthy();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
