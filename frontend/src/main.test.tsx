import "./test/setup";

import { cleanup } from "@testing-library/preact";
import { render } from "preact";
import { afterEach, expect, test } from "vitest";
import { App } from "./app";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

test("mounts the application in the app element", () => {
  document.body.innerHTML = '<div id="app"></div>';

  const root = document.getElementById("app");
  if (!root) throw new Error("#app not found");
  render(<App />, root);

  expect(document.querySelector("#app")?.textContent).toContain(
    "reading planner",
  );
});
