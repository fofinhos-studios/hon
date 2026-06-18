import "../../test/setup";

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/preact";
import { BookSearchStatus } from "./book-search-status";

afterEach(cleanup);

describe("BookSearchStatus", () => {
  test("renders loading and error states", () => {
    const loading = render(
      <BookSearchStatus loading={true} error="" resultCount={0} />,
    );
    expect(loading.getByText("Searching catalog…")).toBeTruthy();
    loading.unmount();

    const failed = render(
      <BookSearchStatus
        loading={false}
        error="Search failed"
        resultCount={0}
      />,
    );
    expect(failed.getByRole("alert").textContent).toBe("Search failed");
  });

  test("announces completed result count", () => {
    const view = render(
      <BookSearchStatus loading={false} error="" resultCount={2} />,
    );

    expect(view.getByText("2 results found")).toBeTruthy();
  });
});
