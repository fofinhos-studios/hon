import "../test/setup";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { DayOfWeek } from "../types";
import { DayPicker } from "./day-picker";

afterEach(cleanup);

describe("DayPicker", () => {
  test("renders all 7 day labels", () => {
    const view = render(<DayPicker selected={[]} onChange={() => {}} />);
    for (const label of ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]) {
      expect(view.getByText(label)).toBeTruthy();
    }
  });

  test("selected days appear as active", () => {
    const view = render(<DayPicker selected={[0, 4]} onChange={() => {}} />);
    const mo = view.getByText("Mo").closest("button");
    const fr = view.getByText("Fr").closest("button");
    const tu = view.getByText("Tu").closest("button");
    expect(mo?.getAttribute("aria-pressed")).toBe("true");
    expect(fr?.getAttribute("aria-pressed")).toBe("true");
    expect(tu?.getAttribute("aria-pressed")).toBe("false");
  });

  test("clicking a day toggles it", () => {
    const onChange = mock((days: DayOfWeek[]) => days);
    const view = render(<DayPicker selected={[]} onChange={onChange} />);
    fireEvent.click(view.getByText("Mo").closest("button")!);
    expect(onChange).toHaveBeenCalledWith([0]);
  });

  test("clicking an active day removes it", () => {
    const onChange = mock((days: DayOfWeek[]) => days);
    const view = render(<DayPicker selected={[0]} onChange={onChange} />);
    fireEvent.click(view.getByText("Mo").closest("button")!);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
