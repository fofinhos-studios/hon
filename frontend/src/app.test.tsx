import "./test/setup";

import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/preact";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "./app";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

test("renders the reading planner home page", () => {
  const view = render(<App />);

  expect(view.getByText("reading planner")).toBeTruthy();
  expect(view.getByRole("heading", { name: "Your books" })).toBeTruthy();
});

test("saving total pages persists the edit and recalculates progress and schedule", async () => {
  localStorage.setItem(
    "hon.books",
    JSON.stringify([
      {
        id: "edit",
        title: "Editable book",
        author: "Author",
        page_count: 100,
        pages_read: 40,
        cover_url: null,
        visuals: { dominant_color: "#aabbcc", artwork: null },
      },
    ]),
  );
  const view = render(<App />);
  fireEvent.click(
    view.getByRole("button", { name: "Edit page count for Editable book" }),
  );
  fireEvent.input(view.getByLabelText("Total pages for Editable book"), {
    target: { value: "200" },
  });
  fireEvent.click(view.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(
      JSON.parse(localStorage.getItem("hon.books") || "[]")[0].page_count,
    ).toBe(200),
  );
  expect(
    (
      view.getByLabelText(
        "Percentage read for Editable book",
      ) as HTMLInputElement
    ).value,
  ).toBe("20");
  expect(
    within(view.getByLabelText("Reading schedule")).getByText("40 / 200 pp"),
  ).toBeTruthy();
  expect(
    within(view.getByLabelText("Reading schedule")).getByText(
      /1 book · 160 pages ·/,
    ),
  ).toBeTruthy();
});

test("removing all books requires confirmation and clears the saved schedule", async () => {
  localStorage.setItem(
    "hon.books",
    JSON.stringify([
      {
        id: "page",
        title: "First Book",
        author: "Author",
        kind: "page",
        format: "physical",
        page_count: 100,
        pages_read: 40,
        cover_url: null,
      },
      {
        id: "audio",
        title: "Second Book",
        author: "Author",
        kind: "audiobook",
        duration_minutes: 300,
        narrators: [],
        cover_url: null,
      },
    ]),
  );
  const confirm = vi.fn(() => false);
  vi.stubGlobal("confirm", confirm);
  const view = render(<App />);
  const schedule = within(view.getByLabelText("Reading schedule"));

  fireEvent.click(view.getByRole("button", { name: "Remove all books" }));
  expect(confirm).toHaveBeenCalledWith(
    "Remove all books from your library and reading schedule? This cannot be undone.",
  );
  expect(view.getByRole("heading", { name: /First Book/ })).toBeTruthy();
  expect(schedule.getByText("40 / 100 pp")).toBeTruthy();
  expect(JSON.parse(localStorage.getItem("hon.books") || "[]")).toHaveLength(2);

  fireEvent.change(view.getByRole("combobox", { name: "Language" }), {
    target: { value: "pt-BR" },
  });
  confirm.mockReturnValue(true);
  fireEvent.click(
    view.getByRole("button", { name: "Remover todos os livros" }),
  );
  expect(confirm).toHaveBeenLastCalledWith(
    "Remover todos os livros da sua biblioteca e do cronograma de leitura? Esta ação não pode ser desfeita.",
  );
  await waitFor(() => expect(localStorage.getItem("hon.books")).toBe("[]"));
  expect(view.getByText("Sua biblioteca está vazia.")).toBeTruthy();
  expect(schedule.getByText("Adicione livros para começar.")).toBeTruthy();
  expect(
    view.queryByRole("button", { name: "Remover todos os livros" }),
  ).toBeNull();

  view.unmount();
  const restored = render(<App />);
  expect(restored.getByText("Sua biblioteca está vazia.")).toBeTruthy();
  expect(
    within(restored.getByLabelText("Cronograma de leitura")).getByText(
      "Adicione livros para começar.",
    ),
  ).toBeTruthy();
});
