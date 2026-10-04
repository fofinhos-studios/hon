import "../test/setup";

import { fireEvent, render, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { calculateSchedule } from "../domain/schedule";
import { makeBook } from "../domain/schedule/test-fixtures";
import { LanguageProvider } from "../i18n";
import {
  CalendarUrlTooLongError,
  createCalendarUrl,
  downloadCalendar,
} from "../services/calendar-export";
import { ScheduleView } from "./schedule-view";

vi.mock("../services/calendar-export", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/calendar-export")>();
  return {
    ...actual,
    createCalendarUrl: vi.fn(),
    downloadCalendar: vi.fn(),
  };
});

const books = [makeBook("book", 10)];
const result = calculateSchedule(
  books,
  [0, 1, 2, 3, 4, 5, 6],
  10,
  "sequential",
  "2026-01-05",
);

function renderSchedule() {
  return render(
    <LanguageProvider>
      <ScheduleView
        books={books}
        result={result}
        pagesPerDay={10}
        method="sequential"
        onReorder={() => {}}
      />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  localStorage.setItem("hon.locale", "en");
  vi.mocked(createCalendarUrl).mockResolvedValue(
    "https://hon.fofinhos.studio/api/calendar/ics?payload=example",
  );
  vi.mocked(downloadCalendar).mockResolvedValue(undefined);
});

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

test("copies the fixed feed URL and downloads the same schedule", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const view = renderSchedule();

  fireEvent.click(view.getByRole("button", { name: "Copy calendar URL" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  expect(writeText).toHaveBeenCalledWith(
    "https://hon.fofinhos.studio/api/calendar/ics?payload=example",
  );
  expect(vi.mocked(createCalendarUrl).mock.calls[0][0].events).toEqual([
    [0, 0, 10],
  ]);
  fireEvent.click(view.getByRole("button", { name: "Download .ics" }));
  await waitFor(() => expect(downloadCalendar).toHaveBeenCalledTimes(1));
  expect(vi.mocked(downloadCalendar).mock.calls[0][0].events).toEqual([
    [0, 0, 10],
  ]);
});

test("shows clipboard errors and keeps download available", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) },
  });
  const view = renderSchedule();
  fireEvent.click(view.getByRole("button", { name: "Copy calendar URL" }));
  await waitFor(() =>
    expect(view.getByRole("alert").textContent).toContain(
      "Check clipboard permissions",
    ),
  );
  expect(
    view
      .getByRole("button", { name: "Download .ics" })
      .hasAttribute("disabled"),
  ).toBe(false);
});

test("shows a localized URL limit error without disabling download", async () => {
  localStorage.setItem("hon.locale", "pt-BR");
  vi.mocked(createCalendarUrl).mockRejectedValue(new CalendarUrlTooLongError());
  const view = renderSchedule();
  fireEvent.click(
    view.getByRole("button", { name: "Copiar URL do calendário" }),
  );
  await waitFor(() =>
    expect(view.getByRole("alert").textContent).toContain(
      "URL de calendário longa demais",
    ),
  );
  expect(
    view.getByRole("button", { name: "Baixar .ics" }).hasAttribute("disabled"),
  ).toBe(false);
});

test("reports a failed download and lets the user retry", async () => {
  vi.mocked(downloadCalendar).mockRejectedValueOnce(
    new Error("Network failed"),
  );
  const view = renderSchedule();
  fireEvent.click(view.getByRole("button", { name: "Download .ics" }));
  await waitFor(() =>
    expect(view.getByRole("alert").textContent).toContain(
      "Could not download the calendar",
    ),
  );
  expect(
    view
      .getByRole("button", { name: "Download .ics" })
      .hasAttribute("disabled"),
  ).toBe(false);
});
