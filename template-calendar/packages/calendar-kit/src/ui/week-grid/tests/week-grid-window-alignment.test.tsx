import { render, screen } from "@testing-library/react";
import { describe, expect as assert, it } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime } from "../../../core/model";
import { DayGrid } from "../../day-grid/day-grid";
import { WeekGrid } from "../week-grid";

const DATE = calendarDate("2026-09-14");
const visibleHours = {
  end: parseLocalTime("12:00"),
  start: parseLocalTime("08:30"),
};

const expectHourRowsAligned = (): void => {
  assert(
    screen.getAllByRole("gridcell", { name: /08:00/u }).length
  ).toBeGreaterThan(0);
  assert(screen.queryAllByRole("gridcell", { name: /08:30/u })).toHaveLength(0);
};

describe("visible hours start off slot grid", () => {
  it("rounds the WeekGrid window start out to the 08:00 hour row", () => {
    render(
      <WeekGrid
        date={DATE}
        events={[]}
        timeZone={UTC}
        visibleHours={visibleHours}
        slotMinutes={60}
      />
    );

    expectHourRowsAligned();
  });

  it("rounds the DayGrid window start out to the 08:00 hour row", () => {
    render(
      <DayGrid
        date={DATE}
        events={[]}
        timeZone={UTC}
        visibleHours={visibleHours}
        slotMinutes={60}
      />
    );

    expectHourRowsAligned();
  });
});
