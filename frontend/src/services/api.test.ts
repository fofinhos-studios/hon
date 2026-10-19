import "../test/setup";

import { afterEach, describe, expect, test, vi } from "vitest";
import { searchBooks, searchSeries } from "./api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(response: Partial<Response>) {
  const fetchMock = vi.fn(async () => response as Response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("searchBooks", () => {
  test("uses the API error detail when present", async () => {
    mockFetch({ ok: false, json: async () => ({ detail: "Search is busy" }) });

    try {
      await searchBooks("dune");
      throw new Error("Expected search to fail");
    } catch (error) {
      expect(error).toHaveProperty("message", "Search is busy");
    }
  });

  test("uses a fallback message when an error response is not JSON", async () => {
    mockFetch({
      ok: false,
      json: async () => {
        throw new Error("not JSON");
      },
    });

    try {
      await searchBooks("dune");
      throw new Error("Expected search to fail");
    } catch (error) {
      expect(error).toHaveProperty("message", "Search failed");
    }
  });

  test("classifies timeout responses for localized display", async () => {
    mockFetch({
      ok: false,
      status: 504,
      json: async () => ({ detail: "Book search timed out" }),
    });

    await expect(searchBooks("dune")).rejects.toMatchObject({
      code: "timeout",
      message: "Book search timed out",
    });
  });
  test("delivers provisional cards before the completed search and preserves late editions", async () => {
    const encoder = new TextEncoder();
    let emit!: (value: Uint8Array<ArrayBuffer>) => void;
    let finish!: () => void;
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        emit = (value) => controller.enqueue(value);
        finish = () => controller.close();
      },
    });
    mockFetch({
      ok: true,
      body,
      headers: new Headers({ "Content-Type": "application/x-ndjson" }),
    });
    const preview = {
      books: [
        {
          id: "pt",
          title: "Babel",
          author: "R. F. Kuang",
          language: "pt",
          publisher: "Edições",
        },
      ],
      series: [],
      source: "bookinfo",
      partial: false,
    };
    const complete = {
      ...preview,
      books: [
        ...preview.books,
        { ...preview.books[0], id: "en", language: "en" },
      ],
      source: "combined",
    };
    const onSnapshot = vi.fn();
    const pending = searchBooks("Babel", { onSnapshot });
    void pending.catch(() => {});

    const first = encoder.encode(
      `${JSON.stringify({ type: "snapshot", result: preview })}\n`,
    );
    const splitInsideAccent = first.indexOf(0xc3) + 1;
    emit(first.subarray(0, 7));
    emit(first.subarray(7, splitInsideAccent));
    emit(first.subarray(splitInsideAccent));
    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalledWith(preview));

    let completed = false;
    void pending.then(
      () => {
        completed = true;
      },
      () => {
        completed = true;
      },
    );
    expect(completed).toBe(false);
    const last = encoder.encode(
      `${JSON.stringify({ type: "final", result: complete })}\n`,
    );
    emit(last.subarray(0, last.length - 1));
    emit(last.subarray(last.length - 1));
    finish();
    await expect(pending).resolves.toEqual(complete);
  });

  test("retains a preview but reports a terminal provider timeout", async () => {
    const preview = {
      books: [],
      series: [],
      source: "bookinfo",
      partial: false,
    };
    const body = `${[
      JSON.stringify({ type: "snapshot", result: preview }),
      JSON.stringify({
        type: "error",
        code: "timeout",
        message: "Catalog timed out",
      }),
    ].join("\n")}\n`;
    mockFetch(
      new Response(body, {
        headers: { "Content-Type": "application/x-ndjson" },
      }),
    );
    const onSnapshot = vi.fn();

    await expect(searchBooks("Dune", { onSnapshot })).rejects.toMatchObject({
      code: "timeout",
      message: "Catalog timed out",
    });
    expect(onSnapshot).toHaveBeenCalledWith(preview);
  });

  test("treats a stream that ends without final results as unavailable", async () => {
    mockFetch(
      new Response(
        `${JSON.stringify({ type: "snapshot", result: { books: [], series: [], source: "bookinfo" } })}\n`,
        { headers: { "Content-Type": "application/x-ndjson" } },
      ),
    );

    await expect(searchBooks("Dune")).rejects.toMatchObject({
      code: "unavailable",
    });
  });
});

describe("searchSeries", () => {
  test("classifies series search failures like book search failures", async () => {
    mockFetch({
      ok: false,
      status: 504,
      json: async () => ({ detail: "Series search timed out" }),
    });

    await expect(searchSeries("dune")).rejects.toMatchObject({
      code: "timeout",
      message: "Series search timed out",
    });
  });
});
