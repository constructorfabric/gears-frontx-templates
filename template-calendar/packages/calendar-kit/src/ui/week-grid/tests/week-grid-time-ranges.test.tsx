import { render, screen } from "@testing-library/react";
import { describe, expect as assert, it, vi } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime } from "../../../core/model";
import type { CalendarTimeRange } from "../../../core/model";
import { WeekGrid } from "../week-grid";

const MONDAY = calendarDate("2026-08-24");
const TUESDAY = calendarDate("2026-08-25");

const lunch = (
  overrides: Partial<CalendarTimeRange> = {}
): CalendarTimeRange => ({
  end: parseLocalTime("12:00"),
  key: "lunch",
  start: parseLocalTime("11:00"),
  ...overrides,
});

describe("WeekGrid time ranges", () => {
  it("draws a range on every visible day when date is omitted", () => {
    render(
      <WeekGrid
        date={MONDAY}
        events={[]}
        timeZone={UTC}
        timeRanges={[lunch()]}
        renderTimeRange={(range) => <span>{range.key}</span>}
      />
    );

    assert(screen.getAllByText("lunch")).toHaveLength(5);
  });

  it("draws a range only on its own date", () => {
    render(
      <WeekGrid
        date={MONDAY}
        events={[]}
        timeZone={UTC}
        timeRanges={[lunch({ date: TUESDAY })]}
        renderTimeRange={(range) => <span>{range.key}</span>}
      />
    );

    assert(screen.getAllByText("lunch")).toHaveLength(1);
  });

  it("starts the band at its start row, spans its duration and hides it from assistive technology", () => {
    const renderTimeRange = vi.fn((range: CalendarTimeRange) => (
      <span>{range.key}</span>
    ));

    render(
      <WeekGrid
        date={MONDAY}
        events={[]}
        timeZone={UTC}
        timeRanges={[
          lunch({
            end: parseLocalTime("12:00"),
            start: parseLocalTime("09:00"),
          }),
        ]}
        renderTimeRange={renderTimeRange}
      />
    );

    // 24 one-hour rows of 43px: 09:00 to 12:00 is 3 rows, starting on the 09:00 row.
    assert(renderTimeRange).toHaveBeenCalledWith(
      assert.objectContaining({ key: "lunch" }),
      { geometry: assert.objectContaining({ height: 129, top: 0 }) }
    );
    assert(
      screen
        .getAllByText("lunch")[0]
        ?.closest("[aria-hidden]")
        ?.getAttribute("aria-hidden")
    ).toBe("true");
  });

  it("keeps minute precision at the band edges", () => {
    const renderTimeRange = vi.fn((range: CalendarTimeRange) => (
      <span>{range.key}</span>
    ));

    render(
      <WeekGrid
        date={MONDAY}
        events={[]}
        timeZone={UTC}
        timeRanges={[
          lunch({
            end: parseLocalTime("10:30"),
            start: parseLocalTime("09:30"),
          }),
        ]}
        renderTimeRange={renderTimeRange}
      />
    );

    // Starts half a row into the 09:00 row and lasts one row.
    assert(renderTimeRange).toHaveBeenCalledWith(
      assert.objectContaining({ key: "lunch" }),
      { geometry: assert.objectContaining({ height: 43, top: 21.5 }) }
    );
  });

  it("sizes the band from rowHeight", () => {
    const renderTimeRange = vi.fn((range: CalendarTimeRange) => (
      <span>{range.key}</span>
    ));

    render(
      <WeekGrid
        date={MONDAY}
        events={[]}
        rowHeight={20}
        timeZone={UTC}
        timeRanges={[
          lunch({
            end: parseLocalTime("12:00"),
            start: parseLocalTime("09:00"),
          }),
        ]}
        renderTimeRange={renderTimeRange}
      />
    );

    assert(renderTimeRange).toHaveBeenCalledWith(
      assert.objectContaining({ key: "lunch" }),
      { geometry: assert.objectContaining({ height: 60, top: 0 }) }
    );
  });

  it("clips a range to visibleHours", () => {
    const renderTimeRange = vi.fn((range: CalendarTimeRange) => (
      <span>{range.key}</span>
    ));

    render(
      <WeekGrid
        date={MONDAY}
        events={[]}
        timeZone={UTC}
        visibleHours={{
          end: parseLocalTime("12:00"),
          start: parseLocalTime("10:00"),
        }}
        timeRanges={[
          lunch({
            end: parseLocalTime("11:00"),
            start: parseLocalTime("09:00"),
          }),
        ]}
        renderTimeRange={renderTimeRange}
      />
    );

    // Only 10:00 to 11:00 is visible: one of two 43px rows, starting at the first row.
    assert(renderTimeRange).toHaveBeenCalledWith(
      assert.objectContaining({ key: "lunch" }),
      { geometry: assert.objectContaining({ height: 43, top: 0 }) }
    );
  });

  it("does not draw a range outside visibleHours", () => {
    const renderTimeRange = vi.fn((range: CalendarTimeRange) => (
      <span>{range.key}</span>
    ));

    render(
      <WeekGrid
        date={MONDAY}
        events={[]}
        timeZone={UTC}
        visibleHours={{
          end: parseLocalTime("12:00"),
          start: parseLocalTime("10:00"),
        }}
        timeRanges={[
          lunch({
            end: parseLocalTime("14:00"),
            start: parseLocalTime("13:00"),
          }),
        ]}
        renderTimeRange={renderTimeRange}
      />
    );

    assert(renderTimeRange).not.toHaveBeenCalled();
  });

  it("does not draw ranges without renderTimeRange", () => {
    render(
      <WeekGrid
        date={MONDAY}
        events={[]}
        timeZone={UTC}
        timeRanges={[lunch()]}
      />
    );

    assert(screen.queryByText("lunch")).toBeNull();
  });

  it("skips an overnight range without unmounting the grid", () => {
    const renderTimeRange = vi.fn((range: CalendarTimeRange) => <span>{range.key}</span>);

    render(
      <WeekGrid
        date={MONDAY}
        events={[]}
        timeZone={UTC}
        timeRanges={[
          lunch({ end: parseLocalTime("02:00"), key: "hold", start: parseLocalTime("22:00") }),
          lunch(),
        ]}
        renderTimeRange={renderTimeRange}
      />
    );

    assert(screen.getAllByText("lunch")).toHaveLength(5);
    assert(screen.queryByText("hold")).toBeNull();
  });

  it("skips a range that ends before it starts without unmounting the grid", () => {
    render(
      <WeekGrid
        date={MONDAY}
        events={[]}
        timeZone={UTC}
        timeRanges={[
          lunch({
            end: parseLocalTime("09:00"),
            start: parseLocalTime("12:00"),
          }),
        ]}
        renderTimeRange={(range) => <span>{range.key}</span>}
      />
    );

    assert(screen.queryByText("lunch")).toBeNull();
  });
});
