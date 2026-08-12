import "./test/setup";

import { afterEach, expect, test } from "bun:test";
import { cleanup } from "@testing-library/preact";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

test("mounts the application in the app element", async () => {
  document.body.innerHTML = '<div id="app"></div>';

  await import("./main");

  expect(document.querySelector("#app")?.textContent).toContain(
    "reading planner",
  );
});
