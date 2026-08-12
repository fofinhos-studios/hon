import "./test/setup";

import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/preact";
import { App } from "./app";

afterEach(cleanup);

test("renders the reading planner home page", () => {
  const view = render(<App />);

  expect(view.getByText("reading planner")).toBeTruthy();
  expect(view.getByText("Your books")).toBeTruthy();
});
