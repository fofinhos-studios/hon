import "../test/setup";

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/preact";
import { Tooltip } from "./tooltip";

afterEach(cleanup);

describe("Tooltip", () => {
  test("renders the tooltip icon and content", () => {
    const view = render(<Tooltip content="This is a test tooltip info" />);

    // Check that the tooltip role is present
    const tooltipElement = view.getByRole("tooltip");
    expect(tooltipElement).toBeTruthy();

    // Check that the content text is rendered
    expect(view.getByText("This is a test tooltip info")).toBeTruthy();
  });
});
