import "./test/setup";

import { fireEvent, render } from "@testing-library/preact";
import { afterEach, expect, test } from "vitest";
import { App } from "./app";
import { BookSearchStatus } from "./features/books/book-search-status";
import { LanguageProvider, useLanguage } from "./i18n";

const originalLanguage = Object.getOwnPropertyDescriptor(navigator, "language");
const originalTitle = document.title;
const originalLang = document.documentElement.lang;

function browserLanguage(value: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value,
  });
}

afterEach(() => {
  localStorage.clear();
  if (originalLanguage)
    Object.defineProperty(navigator, "language", originalLanguage);
  else Reflect.deleteProperty(navigator, "language");
  document.title = originalTitle;
  document.documentElement.lang = originalLang;
});

test("chooses Portuguese from the browser and updates page metadata", () => {
  browserLanguage("pt-BR");
  const view = render(<App />);

  expect(view.getByRole("heading", { name: "Seus livros" })).toBeTruthy();
  expect(
    (view.getByRole("combobox", { name: "Idioma" }) as HTMLSelectElement).value,
  ).toBe("pt-BR");
  expect(document.documentElement.lang).toBe("pt-BR");
  expect(document.title).toBe("hon · planejador de leitura");
});

test("a saved preference takes precedence over the browser language", () => {
  browserLanguage("pt-PT");
  localStorage.setItem("hon.locale", "en");
  const view = render(<App />);

  expect(view.getByRole("heading", { name: "Your books" })).toBeTruthy();
  expect(
    (view.getByRole("combobox", { name: "Language" }) as HTMLSelectElement)
      .value,
  ).toBe("en");
});

test("switches language without losing an open book edit or changing book data", () => {
  browserLanguage("en-US");
  const books = [
    {
      id: "manual-1",
      title: "Meu livro",
      author: "Manual entry",
      page_count: 1234,
      pages_read: 10,
      cover_url: null,
    },
  ];
  localStorage.setItem("hon.books", JSON.stringify(books));
  const view = render(<App />);

  fireEvent.click(
    view.getByRole("button", { name: "Edit page count for Meu livro" }),
  );
  fireEvent.input(view.getByLabelText("Total pages for Meu livro"), {
    target: { value: "1500" },
  });
  fireEvent.change(view.getByRole("combobox", { name: "Language" }), {
    target: { value: "pt-BR" },
  });

  expect(view.getByRole("heading", { name: "Seus livros" })).toBeTruthy();
  expect(view.getAllByText("Adição manual").length).toBeGreaterThan(0);
  expect(
    (view.getByLabelText("Total de páginas de Meu livro") as HTMLInputElement)
      .value,
  ).toBe("1500");
  expect(localStorage.getItem("hon.locale")).toBe("pt-BR");
  expect(JSON.parse(localStorage.getItem("hon.books") || "[]")[0].author).toBe(
    "Manual entry",
  );
  expect(view.getByText(/Termina em/)).toBeTruthy();
  expect(view.getByText(/Termina em \d+ de /)).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Salvar" }));
  expect(view.getByText("1.500 páginas")).toBeTruthy();
});

function SearchErrorHarness() {
  const { locale, setLocale, copy } = useLanguage();
  return (
    <>
      <select
        aria-label={copy.language}
        value={locale}
        onChange={(event) =>
          setLocale(event.currentTarget.value as "en" | "pt-BR")
        }
      >
        <option value="en">English</option>
        <option value="pt-BR">Português (Brasileiro)</option>
      </select>
      <BookSearchStatus
        loading={false}
        error="Book search timed out"
        errorCode="timeout"
        resultCount={0}
      />
    </>
  );
}

test("localizes an API error without showing its English detail", () => {
  browserLanguage("en-US");
  const view = render(
    <LanguageProvider>
      <SearchErrorHarness />
    </LanguageProvider>,
  );
  expect(view.getByRole("alert").textContent).toBe(
    "Book search timed out. Try again.",
  );
  fireEvent.change(view.getByRole("combobox", { name: "Language" }), {
    target: { value: "pt-BR" },
  });
  expect(view.getByRole("alert").textContent).toBe(
    "A busca demorou demais. Tente novamente.",
  );
});
