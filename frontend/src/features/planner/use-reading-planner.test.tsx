import "../../test/setup";

import { cleanup, render } from "@testing-library/preact";
import { afterEach, expect, test } from "vitest";
import type { PageBook, ScheduleResult } from "../../types";
import { useReadingPlanner } from "./use-reading-planner";

afterEach(cleanup);

const book: PageBook = {
  id: "a",
  title: "Book",
  author: "Author",
  kind: "page",
  format: "unspecified",
  page_count: 100,
  cover_url: null,
};

test("visual enrichment does not recalculate reading dates", () => {
  let schedule: ScheduleResult | null = null;
  function Harness({ books }: { books: PageBook[] }) {
    schedule = useReadingPlanner(books).schedule;
    return null;
  }

  const view = render(<Harness books={[book]} />);
  const before = schedule;
  expect(before).not.toBeNull();

  view.rerender(
    <Harness
      books={[
        {
          ...book,
          visuals: { dominant_color: "#123456", artwork: null },
        },
      ]}
    />,
  );
  expect(schedule).toBe(before);

  view.rerender(<Harness books={[{ ...book, page_count: 200 }]} />);
  expect(schedule).not.toBe(before);
});
