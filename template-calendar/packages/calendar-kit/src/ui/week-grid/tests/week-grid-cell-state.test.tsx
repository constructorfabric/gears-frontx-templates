import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect as assert, it } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { WeekGrid } from "../week-grid";
import type { WeekGridProps } from "../week-grid";

const DATE = calendarDate("2026-08-24");

const MORNING = {
  end: parseLocalTime("12:00"),
  start: parseLocalTime("09:00"),
};

const renderWeek = (
  overrides: Partial<
    Omit<WeekGridProps, "maxEventsPerSlot" | "onOverflowSelect">
  > = {}
) =>
  render(
    <WeekGrid
      date={DATE}
      direction="ltr"
      events={[]}
      locale="en-US"
      t={t}
      timeZone={UTC}
      visibleDays={5}
      visibleHours={MORNING}
      {...overrides}
    />
  );

const getTimedCell = (time: string): HTMLElement =>
  screen.getByRole("gridcell", {
    name: new RegExp(`Monday, August 24, 2026 ${time}`, "u"),
  });

describe("WeekGrid cell state", () => {
  it("passes getCellState to renderCell and data-state", () => {
    renderWeek({
      getCellState: (cell) =>
        cell.date === DATE && cell.startTime === parseLocalTime("10:00")
          ? { state: "hold" }
          : undefined,
      renderCell: (context) => <span>{context.state ?? "none"}</span>,
    });

    assert(getTimedCell("10:00")).toHaveAttribute("data-state", "hold");
    assert(within(getTimedCell("10:00")).getByText("hold")).toBeInTheDocument();
    assert(getTimedCell("09:00")).not.toHaveAttribute("data-state");
    assert(within(getTimedCell("09:00")).getByText("none")).toBeInTheDocument();
  });

  it("reports a host-unavailable cell as unavailable and keeps it focusable", () => {
    renderWeek({
      getCellState: (cell) =>
        cell.date === DATE && cell.startTime === parseLocalTime("11:00")
          ? { unavailable: true }
          : undefined,
      renderCell: (context) => (
        <span>{context.isUnavailable ? "blocked" : "open"}</span>
      ),
    });

    assert(
      within(getTimedCell("11:00")).getByText("blocked")
    ).toBeInTheDocument();
    assert(within(getTimedCell("10:00")).getByText("open")).toBeInTheDocument();
    assert(getTimedCell("11:00")).toHaveAttribute("tabindex", "-1");
  });

  it("marks the first and last painted cell of a run as range edges", () => {
    renderWeek({
      interactionMode: "paint-and-move",
      renderCell: (context) => (
        <span>
          {context.isRangeStart ? "range start" : ""}
          {context.isRangeEnd ? "range end" : ""}
        </span>
      ),
      visibleHours: {
        end: parseLocalTime("12:00"),
        start: parseLocalTime("08:00"),
      },
    });

    fireEvent.pointerDown(getTimedCell("09:00"));
    fireEvent.pointerMove(getTimedCell("10:00"));
    fireEvent.pointerEnter(getTimedCell("11:00"));
    fireEvent.pointerUp(getTimedCell("11:00"));

    assert(
      within(getTimedCell("09:00")).getByText("range start")
    ).toBeInTheDocument();
    assert(
      within(getTimedCell("11:00")).getByText("range end")
    ).toBeInTheDocument();
    assert(within(getTimedCell("10:00")).queryByText(/range/u)).toBeNull();
  });
});

describe("WeekGrid header slot", () => {
  it("replaces the built-in weekday and day number and keeps the columnheader role", () => {
    renderWeek({
      renderHeader: (column) => <span>{`Custom ${column.date ?? ""}`}</span>,
    });

    const headers = within(screen.getByRole("grid")).getAllByRole(
      "columnheader"
    );

    assert(headers[1]?.textContent).toBe("Custom 2026-08-24");
    assert(screen.queryByText("MON")).toBeNull();
    assert(headers).toHaveLength(6);
  });
});

describe("WeekGrid slot length", () => {
  it("draws five-minute rows", () => {
    renderWeek({ slotMinutes: 5 });

    const slots = screen.getAllByRole("gridcell", {
      name: /^Monday, August 24, 2026 \d\d:\d\d/u,
    });

    assert(slots).toHaveLength(36);
  });
});
