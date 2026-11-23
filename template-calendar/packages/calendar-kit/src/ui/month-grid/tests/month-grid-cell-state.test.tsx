import { render, screen, within } from "@testing-library/react";
import { describe, expect as assert, it } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { MonthGrid } from "../month-grid";
import type { MonthGridProps } from "../month-grid";

const DATE = calendarDate("2025-09-15");

const renderMonth = (overrides: Partial<MonthGridProps> = {}) =>
  render(
    <MonthGrid
      date={DATE}
      events={[]}
      locale="en-US"
      t={t}
      timeZone={UTC}
      {...overrides}
    />
  );

const day = (label: string): HTMLElement =>
  screen.getByRole("gridcell", { name: new RegExp(`^${label}`, "u") });

describe("MonthGrid cell state", () => {
  it("passes getCellState to renderCell and data-state", () => {
    renderMonth({
      getCellState: (cell) =>
        cell.date === "2025-09-05" ? { state: "full" } : undefined,
      renderCell: (context) => <span>{context.state ?? "none"}</span>,
    });

    assert(day("Friday, September 5, 2025")).toHaveAttribute(
      "data-state",
      "full"
    );
    assert(
      within(day("Friday, September 5, 2025")).getByText("full")
    ).toBeInTheDocument();
    assert(day("Thursday, September 4, 2025")).not.toHaveAttribute(
      "data-state"
    );
  });

  it("draws a host-unavailable day as unavailable and keeps it focusable", () => {
    renderMonth({
      getCellState: (cell) =>
        cell.date === "2025-09-06" ? { unavailable: true } : undefined,
      renderCell: (context) => (
        <span>{context.isUnavailable ? "blocked" : "open"}</span>
      ),
    });

    assert(
      within(day("Saturday, September 6, 2025")).getByText("blocked")
    ).toBeInTheDocument();
    assert(
      within(day("Sunday, September 7, 2025")).getByText("open")
    ).toBeInTheDocument();
    assert(day("Saturday, September 6, 2025")).toHaveAttribute(
      "tabindex",
      "-1"
    );
  });

  it("flags the start and end day of the selected range", () => {
    renderMonth({
      renderCell: (context) => (
        <span>
          {context.isRangeStart ? "range start" : ""}
          {context.isRangeEnd ? "range end" : ""}
        </span>
      ),
      selectedDateRange: {
        end: calendarDate("2025-09-11"),
        start: calendarDate("2025-09-03"),
      },
      selectionMode: "date-range",
    });

    assert(
      within(day("Wednesday, September 3, 2025")).getByText("range start")
    ).toBeInTheDocument();
    assert(
      within(day("Thursday, September 11, 2025")).getByText("range end")
    ).toBeInTheDocument();
    assert(
      within(day("Tuesday, September 9, 2025")).queryByText(/range/u)
    ).toBeNull();
  });
});
