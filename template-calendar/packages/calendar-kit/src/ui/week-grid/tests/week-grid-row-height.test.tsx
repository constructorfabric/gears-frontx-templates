import { render, screen } from "@testing-library/react";
import { describe, expect as assert, it, vi } from "vitest";

import { timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import { WeekGrid } from "../week-grid";
import styles from "../week-grid.module.css";

const DATE = calendarDate("2026-09-14");

const oneHourEvent = timedEvent({
  endTime: "10:00",
  id: "event",
  startDate: "2026-09-14",
  startTime: "09:00",
  title: "Event",
});

describe("WeekGrid rowHeight", () => {
  it("keeps 43px rows when no rowHeight is given", () => {
    render(<WeekGrid date={DATE} events={[oneHourEvent]} timeZone={UTC} />);

    const frame = screen.getByRole("button", { name: /^Event/u }).parentElement;

    assert(frame).toHaveStyle({ blockSize: "43px" });
  });

  it("sizes the row and the event frame from rowHeight", () => {
    render(
      <WeekGrid
        date={DATE}
        events={[oneHourEvent]}
        timeZone={UTC}
        rowHeight={72}
      />
    );

    const frame = screen.getByRole("button", { name: /^Event/u }).parentElement;

    assert(frame).toHaveStyle({ blockSize: "72px" });
    assert(
      frame
        ?.closest<HTMLElement>(`.${styles.container}`)
        ?.style.getPropertyValue("--grid-hour-height")
    ).toBe("72px");
  });

  it.each([0, -1, Number.NaN])("rejects rowHeight %s", (height) => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    assert(() =>
      render(
        <WeekGrid
          date={DATE}
          events={[oneHourEvent]}
          timeZone={UTC}
          rowHeight={height}
        />
      )
    ).toThrow(RangeError);
  });
});
